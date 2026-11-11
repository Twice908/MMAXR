import { midiToHz, moodNotes, nextShimmer, padCutoffHz, PAD_VOICES, type SoundMood } from "./music.js";

/** Short interface sounds. */
export type SoundCue =
  /** A pointer or focus resting on something you can open. */
  | "hover"
  /** Something was chosen. */
  | "select"
  /** Something worked (sign-in accepted, name saved). */
  | "confirm"
  /** Something was refused. Soft, never alarming. */
  | "deny"
  /** A panel or menu opened. */
  | "open"
  /** A panel or menu closed. */
  | "close"
  /** A tiny tactile click. */
  | "tick";

/** Long transition sounds, timed to a visual move. */
export type SoundSweep =
  /** Jump to light speed. */
  | "warp"
  /** Fall towards a planet. */
  | "dive"
  /** Pull back out into space. */
  | "rise";

/** Options for one cue. */
export interface CueOptions {
  /** Pitch as a MIDI note. Defaults to a chord tone of the current mood. */
  readonly midi?: number;
  /** Stereo position from -1 to 1. */
  readonly pan?: number;
}

/** The ambient sound of the app: a pad, wind and distant chimes, plus interface cues. */
export interface Soundscape {
  /** True when the student has sound switched on. */
  readonly enabled: boolean;
  /** True once a user gesture has started the audio engine. */
  readonly unlocked: boolean;
  /** Switch all sound on or off, with a short fade. */
  setEnabled(on: boolean): void;
  /** Start audio. Must run inside a user gesture (click, tap or key press). */
  unlock(): void;
  /** Unlock on the first pointer or key press on `target`. Returns a remover. */
  listenForUnlock(target: EventTarget): () => void;
  /** Glide the pad to a new chord and brightness. */
  setMood(mood: SoundMood, glideSeconds?: number): void;
  /** Fade the ambient bed (not the cues) to a level from 0 to 1. */
  setBedLevel(level: number, seconds?: number): void;
  /** Pause audio while the page is hidden. */
  setSuspended(suspended: boolean): void;
  cue(name: SoundCue, options?: CueOptions): void;
  sweep(name: SoundSweep, seconds: number): void;
  /** A soft landing: low impact and a shimmer of the current chord. */
  arrive(): void;
  dispose(): void;
}

/** Options for {@link createSoundscape}. */
export interface SoundscapeOptions {
  readonly enabled: boolean;
  readonly mood: SoundMood;
  /** Random source for chimes and noise. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Called when {@link Soundscape.setEnabled} changes the switch, to remember the choice. */
  readonly onEnabledChange?: (on: boolean) => void;
}

type AudioContextConstructor = new (options?: AudioContextOptions) => AudioContext;

interface Engine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly bed: GainNode;
  readonly cues: GainNode;
  readonly reverbIn: GainNode;
  readonly echoIn: GainNode;
  readonly noise: AudioBuffer;
  readonly voices: readonly { readonly oscillators: readonly OscillatorNode[] }[];
  readonly sub: OscillatorNode;
  readonly air: readonly OscillatorNode[];
  readonly padFilter: BiquadFilterNode;
  readonly sources: readonly AudioScheduledSourceNode[];
}

const MASTER_LEVEL = 0.9;
const BED_LEVEL = 0.62;

/**
 * Build the soundscape. Nothing is created until {@link Soundscape.unlock} runs, because browsers
 * only allow audio after a user gesture. Everything is synthesised live, so there are no audio
 * files to load or license.
 */
export function createSoundscape(options: SoundscapeOptions): Soundscape {
  const random = options.random ?? Math.random;
  let enabled = options.enabled;
  let mood = options.mood;
  let bedLevel = 1;
  let suspended = false;
  let engine: Engine | null = null;
  let shimmerTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const audible = (): boolean =>
    engine !== null && enabled && !suspended && !disposed && engine.ctx.state === "running";

  const scheduleShimmer = (): void => {
    clearTimeout(shimmerTimer);
    const next = nextShimmer(mood, random);
    shimmerTimer = setTimeout(() => {
      if (audible() && engine && bedLevel > 0.05) {
        bell(engine, engine.ctx.currentTime + 0.02, next.midi, next.gain * bedLevel, next.pan, 0.92, 3.2);
      }
      if (!disposed) scheduleShimmer();
    }, next.delayMs);
  };

  const applyMood = (glideSeconds: number): void => {
    if (!engine) return;
    const now = engine.ctx.currentTime;
    const constant = Math.max(0.01, glideSeconds / 4);
    const notes = moodNotes(mood);
    engine.voices.forEach((voice, index) => {
      const hz = midiToHz(notes[index] ?? mood.rootMidi);
      for (const oscillator of voice.oscillators) oscillator.frequency.setTargetAtTime(hz, now, constant);
    });
    engine.sub.frequency.setTargetAtTime(midiToHz(mood.rootMidi - 12), now, constant);
    engine.air.forEach((oscillator, index) => {
      const note = notes[(index * 2 + 1) % notes.length] ?? mood.rootMidi;
      oscillator.frequency.setTargetAtTime(midiToHz(note + 24), now, constant);
    });
    engine.padFilter.frequency.setTargetAtTime(padCutoffHz(mood.brightness), now, constant);
  };

  const soundscape: Soundscape = {
    get enabled() {
      return enabled;
    },
    get unlocked() {
      return engine !== null;
    },
    setEnabled(on) {
      if (on === enabled) return;
      enabled = on;
      options.onEnabledChange?.(on);
      if (!engine) return;
      const { ctx, master } = engine;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      if (on) {
        void ctx.resume().then(() => {
          master.gain.setTargetAtTime(MASTER_LEVEL, ctx.currentTime, 0.25);
        });
      } else {
        master.gain.setTargetAtTime(0, now, 0.08);
      }
    },
    unlock() {
      if (disposed) return;
      if (!engine) {
        engine = buildEngine(random);
        if (!engine) return;
        applyMood(0);
        engine.bed.gain.setValueAtTime(0, engine.ctx.currentTime);
        engine.bed.gain.setTargetAtTime(BED_LEVEL * bedLevel, engine.ctx.currentTime + 0.1, 1.2);
        engine.master.gain.setValueAtTime(enabled ? MASTER_LEVEL : 0, engine.ctx.currentTime);
        scheduleShimmer();
      }
      if (enabled && !suspended && engine.ctx.state !== "running") void engine.ctx.resume();
    },
    listenForUnlock(target) {
      const handler = (): void => {
        soundscape.unlock();
        if (engine) remove();
      };
      const remove = (): void => {
        target.removeEventListener("pointerdown", handler);
        target.removeEventListener("keydown", handler);
      };
      target.addEventListener("pointerdown", handler);
      target.addEventListener("keydown", handler);
      return remove;
    },
    setMood(next, glideSeconds = 2.4) {
      mood = next;
      applyMood(glideSeconds);
    },
    setBedLevel(level, seconds = 1.5) {
      bedLevel = Math.min(1, Math.max(0, level));
      if (!engine) return;
      engine.bed.gain.setTargetAtTime(BED_LEVEL * bedLevel, engine.ctx.currentTime, Math.max(0.01, seconds / 3));
    },
    setSuspended(next) {
      suspended = next;
      if (!engine) return;
      if (next) void engine.ctx.suspend();
      else if (enabled) void engine.ctx.resume();
    },
    cue(name, cueOptions = {}) {
      if (!audible() || !engine) return;
      const notes = moodNotes(mood);
      const midi = cueOptions.midi ?? (notes[2] ?? mood.rootMidi) + 24;
      const pan = cueOptions.pan ?? 0;
      playCue(engine, name, midi, pan, notes);
    },
    sweep(name, seconds) {
      if (!audible() || !engine) return;
      playSweep(engine, name, Math.max(0.2, seconds), mood);
    },
    arrive() {
      if (!audible() || !engine) return;
      playArrival(engine, moodNotes(mood));
    },
    dispose() {
      disposed = true;
      clearTimeout(shimmerTimer);
      if (!engine) return;
      for (const source of engine.sources) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      void engine.ctx.close();
      engine = null;
    },
  };
  return soundscape;
}

function audioContextConstructor(): AudioContextConstructor | undefined {
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext;
}

/** Build the mixing desk and the ambient bed. Returns null where Web Audio is missing. */
function buildEngine(random: () => number): Engine | null {
  const Constructor = audioContextConstructor();
  if (!Constructor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Constructor({ latencyHint: "interactive" });
  } catch {
    return null;
  }

  // Desk: every bus -> glue compressor -> limiter -> master fader -> speakers.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 18;
  glue.ratio.value = 2.5;
  glue.attack.value = 0.02;
  glue.release.value = 0.4;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  const master = ctx.createGain();
  master.gain.value = 0;
  glue.connect(limiter).connect(master).connect(ctx.destination);

  // Hall reverb: pre-delay, then a generated impulse that darkens as it decays.
  const reverbIn = ctx.createGain();
  const preDelay = ctx.createDelay(0.2);
  preDelay.delayTime.value = 0.028;
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 4.2, 2.4, random);
  const reverbOut = ctx.createGain();
  reverbOut.gain.value = 0.72;
  reverbIn.connect(preDelay).connect(convolver).connect(reverbOut).connect(glue);

  // Ping-pong echo, filtered so repeats soften, also feeding the hall.
  const echoIn = ctx.createGain();
  const left = ctx.createDelay(1);
  const right = ctx.createDelay(1);
  left.delayTime.value = 0.34;
  right.delayTime.value = 0.51;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;
  const feedbackLeft = ctx.createGain();
  const feedbackRight = ctx.createGain();
  feedbackLeft.gain.value = 0.32;
  feedbackRight.gain.value = 0.32;
  const merger = ctx.createChannelMerger(2);
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.32;
  echoIn.connect(tone).connect(left);
  left.connect(feedbackLeft).connect(right);
  right.connect(feedbackRight).connect(left);
  left.connect(merger, 0, 0);
  right.connect(merger, 0, 1);
  merger.connect(echoOut);
  echoOut.connect(glue);
  echoOut.connect(reverbIn);

  const cues = ctx.createGain();
  cues.gain.value = 0.9;
  cues.connect(glue);

  const bed = ctx.createGain();
  bed.gain.value = 0;
  bed.connect(glue);
  const bedSend = ctx.createGain();
  bedSend.gain.value = 0.38;
  bed.connect(bedSend).connect(reverbIn);

  const sources: AudioScheduledSourceNode[] = [];
  const startLfo = (hz: number, depth: number, target: AudioParam): void => {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = hz;
    const amount = ctx.createGain();
    amount.gain.value = depth;
    lfo.connect(amount).connect(target);
    lfo.start();
    sources.push(lfo);
  };

  // Pad: five voices of two detuned saws each, through one slowly breathing low-pass filter.
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.Q.value = 0.7;
  padFilter.frequency.value = 500;
  padFilter.connect(bed);
  startLfo(0.031, 160, padFilter.frequency);
  const voices: { oscillators: OscillatorNode[] }[] = [];
  for (let index = 0; index < PAD_VOICES; index += 1) {
    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 0.02;
    startLfo(0.047 + index * 0.013, 0.008, voiceGain.gain);
    const panner = ctx.createStereoPanner();
    panner.pan.value = -0.65 + (1.3 * index) / (PAD_VOICES - 1);
    voiceGain.connect(panner).connect(padFilter);
    const oscillators: OscillatorNode[] = [];
    for (const detune of [-7, 6]) {
      const oscillator = ctx.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.detune.value = detune;
      oscillator.connect(voiceGain);
      oscillator.start();
      sources.push(oscillator);
      oscillators.push(oscillator);
    }
    voices.push({ oscillators });
  }

  // Sub: a quiet sine an octave under the root, for weight on good speakers and headphones.
  const sub = ctx.createOscillator();
  sub.type = "sine";
  const subGain = ctx.createGain();
  subGain.gain.value = 0.045;
  sub.connect(subGain).connect(bed);
  sub.start();
  sources.push(sub);

  // Air: high sines heard only through the reverb, the "glow" above the pad.
  const airGain = ctx.createGain();
  airGain.gain.value = 0.0035;
  airGain.connect(reverbIn);
  const air: OscillatorNode[] = [];
  for (let index = 0; index < 3; index += 1) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.connect(airGain);
    oscillator.start();
    sources.push(oscillator);
    air.push(oscillator);
  }

  // Solar wind: pink noise through a wandering band-pass, slowly drifting across the stereo field.
  const noise = makeNoise(ctx, 6, random);
  const wind = ctx.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = "bandpass";
  windFilter.Q.value = 0.8;
  windFilter.frequency.value = 520;
  startLfo(0.021, 300, windFilter.frequency);
  const windGain = ctx.createGain();
  windGain.gain.value = 0.05;
  const windPan = ctx.createStereoPanner();
  startLfo(0.017, 0.7, windPan.pan);
  wind.connect(windFilter).connect(windGain).connect(windPan).connect(bed);
  wind.start();
  sources.push(wind);

  return { ctx, master, bed, cues, reverbIn, echoIn, noise, voices, sub, air, padFilter, sources };
}

/** A stereo impulse response: decaying noise that loses high frequencies as it fades. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, random: () => number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  const fadeIn = Math.floor(rate * 0.006);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let smoothed = 0;
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      const white = random() * 2 - 1;
      smoothed += (0.78 - 0.7 * t) * (white - smoothed);
      const onset = index < fadeIn ? index / fadeIn : 1;
      data[index] = smoothed * (1 - t) ** decay * onset;
    }
  }
  return buffer;
}

/** Stereo pink noise (Paul Kellet's economy filter), loopable. */
function makeNoise(ctx: BaseAudioContext, seconds: number, random: () => number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let index = 0; index < length; index += 1) {
      const white = random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[index] = (b0 + b1 + b2 + white * 0.1848) * 0.18;
    }
  }
  return buffer;
}

/** Disconnect a chain of nodes once `source` ends, so short cues do not pile up. */
function releaseOnEnd(source: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  source.onended = () => {
    for (const node of nodes) node.disconnect();
  };
}

/** A glassy bell: inharmonic sine partials with an instant attack and long decay. */
function bell(
  engine: Engine,
  at: number,
  midi: number,
  gain: number,
  pan: number,
  wet: number,
  decay: number,
  echo = 0,
): void {
  const { ctx } = engine;
  const hz = midiToHz(midi);
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(engine.cues);
  const send = ctx.createGain();
  send.gain.value = wet;
  panner.connect(send).connect(engine.reverbIn);
  const echoSend = ctx.createGain();
  echoSend.gain.value = echo;
  panner.connect(echoSend).connect(engine.echoIn);
  const partials: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [2, 0.42, 0.7],
    [2.76, 0.22, 0.5],
    [5.4, 0.07, 0.28],
  ];
  let longest: OscillatorNode | null = null;
  const nodes: AudioNode[] = [panner, send, echoSend];
  for (const [ratio, amplitude, length] of partials) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = hz * ratio;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain * amplitude, at + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay * length);
    oscillator.connect(envelope).connect(panner);
    oscillator.start(at);
    oscillator.stop(at + decay * length + 0.05);
    nodes.push(oscillator, envelope);
    if (!longest) longest = oscillator;
  }
  if (longest) releaseOnEnd(longest, nodes);
}

/** A pitched blip with a pitch glide, optional low-pass, and an exponential tail. */
function blip(
  engine: Engine,
  at: number,
  type: OscillatorType,
  fromHz: number,
  toHz: number,
  seconds: number,
  gain: number,
  options: { readonly cutoff?: number; readonly pan?: number; readonly wet?: number } = {},
): void {
  const { ctx } = engine;
  const oscillator = ctx.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(fromHz, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + seconds);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(gain, at + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = options.cutoff ?? 8000;
  const panner = ctx.createStereoPanner();
  panner.pan.value = options.pan ?? 0;
  oscillator.connect(filter).connect(envelope).connect(panner).connect(engine.cues);
  const send = ctx.createGain();
  send.gain.value = options.wet ?? 0.25;
  panner.connect(send).connect(engine.reverbIn);
  oscillator.start(at);
  oscillator.stop(at + seconds + 0.05);
  releaseOnEnd(oscillator, [oscillator, filter, envelope, panner, send]);
}

/** Filtered noise with a frequency sweep and a swell-then-release envelope. */
function noiseSweep(
  engine: Engine,
  at: number,
  seconds: number,
  options: {
    readonly type: BiquadFilterType;
    readonly fromHz: number;
    readonly toHz: number;
    readonly peak: number;
    readonly q?: number;
    readonly pan?: number;
    readonly attack?: number;
    readonly release?: number;
    readonly wet?: number;
    readonly offset?: number;
  },
): void {
  const { ctx } = engine;
  const source = ctx.createBufferSource();
  source.buffer = engine.noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.Q.value = options.q ?? 1;
  filter.frequency.setValueAtTime(options.fromHz, at);
  filter.frequency.exponentialRampToValueAtTime(options.toHz, at + seconds);
  const envelope = ctx.createGain();
  const attack = options.attack ?? seconds * 0.85;
  const release = options.release ?? 0.35;
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(options.peak, at + attack);
  envelope.gain.setValueAtTime(options.peak, at + Math.max(attack, seconds - 0.01));
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds + release);
  const panner = ctx.createStereoPanner();
  panner.pan.value = options.pan ?? 0;
  source.connect(filter).connect(envelope).connect(panner).connect(engine.cues);
  const send = ctx.createGain();
  send.gain.value = options.wet ?? 0.3;
  panner.connect(send).connect(engine.reverbIn);
  source.start(at, options.offset ?? 0);
  source.stop(at + seconds + release + 0.05);
  releaseOnEnd(source, [source, filter, envelope, panner, send]);
}

function playCue(engine: Engine, name: SoundCue, midi: number, pan: number, notes: readonly number[]): void {
  const at = engine.ctx.currentTime + 0.005;
  switch (name) {
    case "hover":
      bell(engine, at, midi, 0.05, pan, 0.55, 1.4, 0.22);
      noiseSweep(engine, at, 0.05, { type: "highpass", fromHz: 6000, toHz: 9000, peak: 0.012, attack: 0.01, release: 0.04, pan });
      return;
    case "select":
      bell(engine, at, midi, 0.075, pan, 0.5, 1.8, 0.3);
      blip(engine, at, "sine", 150, 62, 0.22, 0.09, { cutoff: 600, pan });
      return;
    case "confirm": {
      const root = (notes[0] ?? 50) + 24;
      const steps = [0, 7, 12, 16];
      steps.forEach((step, index) => {
        bell(engine, at + index * 0.075, root + step, 0.05, -0.4 + index * 0.27, 0.6, 2.2, 0.25);
      });
      return;
    }
    case "deny":
      blip(engine, at, "triangle", midiToHz(64), midiToHz(63.6), 0.16, 0.07, { cutoff: 1400, wet: 0.2 });
      blip(engine, at + 0.13, "triangle", midiToHz(61), midiToHz(60.6), 0.26, 0.065, { cutoff: 1100, wet: 0.25 });
      return;
    case "open":
      blip(engine, at, "sine", 480, 820, 0.12, 0.05, { pan, wet: 0.35 });
      noiseSweep(engine, at, 0.03, { type: "highpass", fromHz: 3000, toHz: 3000, peak: 0.02, attack: 0.004, release: 0.03, pan });
      return;
    case "close":
      blip(engine, at, "sine", 820, 440, 0.12, 0.045, { pan, wet: 0.35 });
      return;
    case "tick":
      noiseSweep(engine, at, 0.012, { type: "highpass", fromHz: 2600, toHz: 2600, peak: 0.03, attack: 0.002, release: 0.02, pan, wet: 0.1 });
      return;
  }
}

function playSweep(engine: Engine, name: SoundSweep, seconds: number, mood: SoundMood): void {
  const at = engine.ctx.currentTime + 0.01;
  const root = mood.rootMidi;
  switch (name) {
    case "warp": {
      // Two band-passed noise layers spread left and right, rising together, plus a saw riser.
      noiseSweep(engine, at, seconds, { type: "bandpass", fromHz: 160, toHz: 4200, peak: 0.17, q: 1.4, pan: -0.55, offset: 0.3 });
      noiseSweep(engine, at, seconds, { type: "bandpass", fromHz: 190, toHz: 3600, peak: 0.17, q: 1.4, pan: 0.55, offset: 2.1 });
      riser(engine, at, seconds, midiToHz(root), midiToHz(root + 12), 0.055);
      blip(engine, at + seconds - 0.05, "sine", 95, 38, 1.4, 0.22, { cutoff: 260, wet: 0.5 });
      return;
    }
    case "dive": {
      // Heavier: a low rumble opening up like entering an atmosphere, then a muffled landing.
      noiseSweep(engine, at, seconds, { type: "lowpass", fromHz: 140, toHz: 2600, peak: 0.2, q: 0.9, offset: 1.2, wet: 0.35 });
      noiseSweep(engine, at, seconds, { type: "bandpass", fromHz: 400, toHz: 5200, peak: 0.07, q: 2.2, pan: 0.35, offset: 3.4 });
      riser(engine, at, seconds, midiToHz(root + 12), midiToHz(root + 24), 0.04);
      blip(engine, at + seconds - 0.04, "sine", 120, 40, 0.9, 0.26, { cutoff: 220, wet: 0.45 });
      return;
    }
    case "rise": {
      // Pulling back out: a falling whoosh that opens into the room.
      noiseSweep(engine, at, seconds, {
        type: "bandpass",
        fromHz: 3600,
        toHz: 260,
        peak: 0.12,
        q: 1.2,
        attack: 0.08,
        release: 0.6,
        wet: 0.5,
        offset: 0.9,
      });
      return;
    }
  }
}

/** A filtered saw that climbs in pitch and brightness over `seconds`. */
function riser(engine: Engine, at: number, seconds: number, fromHz: number, toHz: number, gain: number): void {
  const { ctx } = engine;
  const nodes: AudioNode[] = [];
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(180, at);
  filter.frequency.exponentialRampToValueAtTime(2800, at + seconds);
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + seconds * 0.9);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds + 0.3);
  filter.connect(envelope).connect(engine.cues);
  const send = ctx.createGain();
  send.gain.value = 0.4;
  envelope.connect(send).connect(engine.reverbIn);
  nodes.push(filter, envelope, send);
  let first: OscillatorNode | null = null;
  for (const detune of [-9, 9]) {
    const oscillator = ctx.createOscillator();
    oscillator.type = "sawtooth";
    oscillator.detune.value = detune;
    oscillator.frequency.setValueAtTime(fromHz, at);
    oscillator.frequency.exponentialRampToValueAtTime(toHz, at + seconds);
    oscillator.connect(filter);
    oscillator.start(at);
    oscillator.stop(at + seconds + 0.35);
    nodes.push(oscillator);
    if (!first) first = oscillator;
  }
  if (first) releaseOnEnd(first, nodes);
}

function playArrival(engine: Engine, notes: readonly number[]): void {
  const at = engine.ctx.currentTime + 0.01;
  blip(engine, at, "sine", 82, 41, 1.6, 0.2, { cutoff: 240, wet: 0.5 });
  noiseSweep(engine, at, 0.9, { type: "lowpass", fromHz: 2400, toHz: 300, peak: 0.05, attack: 0.02, release: 0.8, wet: 0.6 });
  notes.forEach((note, index) => {
    bell(engine, at + 0.12 + index * 0.06, note + 24, 0.03, -0.6 + index * 0.3, 0.85, 2.8, 0.2);
  });
}
