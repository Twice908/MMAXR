/**
 * Plain, serializable content for the immersive (AR/VR) lesson UI. The module
 * builds it from learning state; the renderer only draws it. Actions are the
 * same command strings the screen UI uses, plus a few XR-only commands.
 */

/** XR-only commands emitted by the immersive UI, in addition to module commands. */
export const XR_COMMAND = {
  exit: "xr:exit",
  recenter: "xr:recenter",
  enterVr: "xr:enter-vr",
  enterAr: "xr:enter-ar",
} as const;

/** A simple labelled command button. */
export interface XrCommandButton {
  readonly label: string;
  readonly command: string;
}

/** A particle stepper row. */
export interface XrParticleRow {
  readonly id: "proton" | "neutron" | "electron";
  readonly label: string;
  readonly count: number;
  /** CSS colour of the particle swatch. */
  readonly color: string;
  readonly addCommand: string;
  readonly removeCommand: string;
}

/** One answer option of a check question. */
export interface XrAssessmentOption {
  readonly label: string;
  readonly command: string;
  readonly state: "idle" | "correct" | "incorrect" | "answer";
  readonly disabled: boolean;
}

/** The current check question, if one is showing. */
export interface XrAssessmentContent {
  readonly step: string;
  readonly prompt: string;
  readonly options: readonly XrAssessmentOption[];
  readonly feedback: string;
  /** Label of the continue button, or null while it is hidden. */
  readonly continueLabel: string | null;
  readonly continueCommand: string;
}

/** Everything the immersive UI shows. */
export interface XrLessonContent {
  /** Small heading such as "MISSION 1 OF 4" or "FREE PLAY". */
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  /** Mission progress, 0-100. */
  readonly progress: number;
  readonly feedback: string;
  readonly hint: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
  readonly check: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
  readonly freePlay: { readonly label: string; readonly command: string } | null;
  readonly assessment: XrAssessmentContent | null;
  readonly particles: readonly XrParticleRow[];
  readonly element: {
    readonly symbol: string;
    readonly name: string;
    readonly rows: readonly { readonly label: string; readonly value: string }[];
  };
  /** Narration caption, or an empty string. */
  readonly caption: string;
  readonly resetAtom: XrCommandButton;
  readonly exitLabel: string;
  /** Session state: which entry buttons to offer, or Exit while inside XR. */
  readonly session: {
    readonly inXr: boolean;
    readonly canEnterVr: boolean;
    readonly canEnterAr: boolean;
  };
  /** Narration controls (sound toggle, captions toggle, replay). */
  readonly narration: {
    readonly sound: XrCommandButton;
    readonly captions: XrCommandButton;
    readonly replay: XrCommandButton;
  };
}
