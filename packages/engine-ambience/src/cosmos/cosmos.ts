import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget,
  type IUniform,
} from "three";
import { clamp01, damp, ease, tween, zoomBetween, type Easing, type Tween } from "../motion.js";
import {
  hexToRgb,
  mixVividPalette,
  paletteGradient,
  paletteToRgb,
  type CosmosPalette,
  type Rgb,
  type RgbPalette,
} from "../palette.js";
import { pixelRatioCap, type QualityTier } from "../preference.js";
import {
  coverRadius,
  orbitThrough,
  rectToWorld,
  unitsPerPixel,
  visibleHeightAt,
  worldToUv,
  type ViewportSize,
  type WorldDisc,
} from "../space-math.js";
import {
  COMPOSITE_FRAGMENT,
  FULLSCREEN_VERTEX,
  GLOW_FRAGMENT,
  GLOW_VERTEX,
  HALO_FRAGMENT,
  NEBULA_FRAGMENT,
  ORBIT_FRAGMENT,
  ORBIT_VERTEX,
  PLANET_FRAGMENT,
  RING_FRAGMENT,
  RING_VERTEX,
  SPHERE_VERTEX,
  STAR_FRAGMENT,
  STAR_VERTEX,
  SUN_FRAGMENT,
} from "./glsl.js";
import { JOURNEY_FRAGMENT } from "./journey-glsl.js";

/** Surface look of a planet. */
export type PlanetStyle =
  /** Gas giant with flowing bands and a storm spot. */
  | "banded"
  /** Faceted crystal cells with glinting edges. */
  | "crystal"
  /** Dark storm bands with lightning running through them, even on the night side. */
  | "storm"
  /** Oceans, land and drifting clouds. */
  | "ocean";

/** How a planet looks. */
export interface PlanetOptions {
  readonly style: PlanetStyle;
  /** Three surface colours, darkest to brightest, as `#rrggbb`. */
  readonly colors: readonly [string, string, string];
  /** Colour of the atmosphere rim and halo. */
  readonly atmosphere: string;
  /** Halo radius relative to the planet. Default 1.14. */
  readonly haloScale?: number;
  /** Halo brightness. Default 1. */
  readonly haloStrength?: number;
  /** Thin glowing rings with a bright electron running along each. */
  readonly rings?: { readonly count: number; readonly color: string };
  /** A small companion moon. */
  readonly moon?: { readonly colors: readonly [string, string, string]; readonly atmosphere: string; readonly size?: number };
  /** Spin in radians per second. Default 0.08. */
  readonly spin?: number;
  /** Axial tilt in radians. Default 0.35. */
  readonly tilt?: number;
  /** The star that lights this planet. Without one, light comes from the upper left. */
  readonly lightFrom?: CelestialBody;
  /** Light depth relative to the star distance: positive is in front, negative backlights. Default 0.6. */
  readonly lightDepth?: number;
  /** Varies the noise so planets of one style differ. */
  readonly seed?: number;
  /** Sphere detail. Default 64. */
  readonly segments?: number;
}

/** How a star (sun) looks. */
export interface StarOptions {
  /** Centre colour of the disc. */
  readonly core: string;
  /** Limb and glow colour. */
  readonly edge: string;
  /** Overall brightness. Default 1. */
  readonly intensity?: number;
  /** Glow radius relative to the disc. Default 3.6. */
  readonly glowScale?: number;
  /** Diffraction spike strength. Default 0.5. */
  readonly spikes?: number;
  readonly seed?: number;
}

/** A planet or star in the cosmos. */
export interface CelestialBody {
  /**
   * Sit exactly behind this element: its centre is the body's centre, half its width the radius.
   * CSS lays the scene out; the body follows on every frame, including while scrolling.
   */
  anchorTo(element: HTMLElement | null): void;
  /** Brighten and grow slightly, as when pointed at or focused. */
  setHighlight(on: boolean): void;
  /** Fly to fill the screen (1) or back to the anchor (0). */
  travel(target: 0 | 1, durationMs: number): Promise<void>;
  /** Jump to a travel progress from 0 (at anchor) to 1 (filling the screen). */
  setTravel(progress: number): void;
  remove(): void;
}

/** A faint orbit drawn around a star through a planet. */
export interface Orbit {
  remove(): void;
}

/** Options for {@link Cosmos.addOrbit}. */
export interface OrbitOptions {
  readonly color: string;
  /** Laps per second of the light running along the orbit. Default 0.035. */
  readonly speed?: number;
  readonly phase?: number;
  /** Orbit width relative to the star-planet distance. Default 1.2. */
  readonly widen?: number;
}

/** Options for {@link Cosmos.startJourney}. */
export interface JourneyOptions {
  /** Colours of the clouds, particles and space. */
  readonly palette: CosmosPalette;
  /** Colour of the shells and electrons of the atom at the end. */
  readonly shellColor: string;
  /** Colour of the nucleus. */
  readonly nucleusColor: string;
  /** Electrons in each shell of the final atom, innermost first (up to four shells). */
  readonly shells: readonly number[];
  /** When given, a second atom arrives beside the first (for example sodium and chlorine). */
  readonly secondShells?: readonly number[];
  /** Time from the start point to the atom. */
  readonly durationMs: number;
  /** Where to start: 0 is the full descent from the atmosphere, about 0.5 starts among the particles. */
  readonly from?: number;
  /** Called every frame with progress from `from` to 1. */
  readonly onProgress?: (progress: number) => void;
}

/** A running descent. It keeps animating at the atom until stopped. */
export interface Journey {
  /** Resolves when the descent reaches the atom (or a skip finishes). */
  readonly arrived: Promise<void>;
  readonly progress: number;
  /** Rush to the atom quickly. */
  skip(): void;
  /** Leave journey mode; the normal sky returns. */
  stop(): void;
}

/** The living space backdrop. */
export interface Cosmos {
  /** False when WebGL is unavailable; the element then shows a CSS gradient instead. */
  readonly supported: boolean;
  /** The canvas (or fallback element) to place in the page. */
  readonly element: HTMLElement;
  /** The palette the nebula is showing or moving towards. */
  readonly palette: CosmosPalette;
  /** Blend the nebula to a new palette. */
  setPalette(palette: CosmosPalette, durationMs?: number): void;
  /** Change speed: 0 is a slow cruise, 1 is light speed with streaking stars. */
  warpTo(amount: number, durationMs: number, easing?: Easing): Promise<void>;
  addPlanet(options: PlanetOptions): CelestialBody;
  addStar(options: StarOptions): CelestialBody;
  addOrbit(star: CelestialBody, planet: CelestialBody, options: OrbitOptions): Orbit;
  /** Light the nebula around a body (or nothing). */
  focus(body: CelestialBody | null): void;
  /** Replace the sky with a descent from a planet's atmosphere down to a single atom. */
  startJourney(options: JourneyOptions): Journey;
  /**
   * A still image of the sky (nebula and stars, no bodies) in a palette, as a JPEG data URL,
   * for pages that want the same sky without a running WebGL loop. Null when unavailable.
   */
  snapshot(palette: CosmosPalette): string | null;
  /** Pause or resume rendering, for example while a lesson has the screen. */
  setRunning(running: boolean): void;
  dispose(): void;
}

/** Options for {@link createCosmos}. */
export interface CosmosOptions {
  readonly palette: CosmosPalette;
  readonly quality: QualityTier;
  /** Freeze drifting, twinkling and streaks. */
  readonly reducedMotion: boolean;
  /** Random source for the star field. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Which part of the nebula to show. Fixed by default so every visit looks the same. */
  readonly nebulaSeed?: readonly [number, number];
}

const FOV = 40;
const CAMERA_Z = 10;
const STAR_DEPTH = 100;
const STAR_NEAR = 8;

interface FrameInfo {
  readonly time: number;
  readonly dt: number;
  readonly viewport: ViewportSize;
  readonly fov: number;
  readonly cover: number;
  readonly unitsPerPx: number;
  readonly ambient: Rgb;
  readonly motion: number;
}

type Uniforms = Record<string, IUniform>;

/** A camera move towards one travelling body, applied to every other body. */
interface Dolly {
  /** Where the travelling body sits at rest. */
  readonly tx: number;
  readonly ty: number;
  /** Where it is drawn now. */
  readonly cx: number;
  readonly cy: number;
  /** How much it has grown: everything else scales away from it by the same amount. */
  readonly zoom: number;
}

interface BodyInternals extends CelestialBody {
  readonly root: Group;
  readonly focusColor: Rgb;
  /** Resting place, from the DOM anchor. */
  disc: WorldDisc;
  /** Where the body is drawn this frame (differs from `disc` while travelling). */
  placed: WorldDisc;
  travelProgress: number;
  visible: boolean;
  removed: boolean;
  /** Read the anchor's position. */
  measure(frame: FrameInfo): void;
  /** Position the body, following `dolly` when another body is travelling. */
  place(frame: FrameInfo, dolly: Dolly | null): void;
  dispose(): void;
}

function color(hex: string): Color {
  const [r, g, b] = hexToRgb(hex);
  return new Color(r, g, b);
}

function setColor(target: IUniform, rgb: Rgb): void {
  (target.value as Color).setRGB(rgb[0], rgb[1], rgb[2]);
}

/**
 * Create the cosmos: a full-screen WebGL canvas with a drifting nebula, a deep star field, and
 * planets and stars anchored to DOM elements. Falls back to a CSS gradient without WebGL.
 */
export function createCosmos(options: CosmosOptions): Cosmos {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      antialias: options.quality === "high",
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
  } catch {
    return createFallbackCosmos(options.palette);
  }
  return createWebGlCosmos(renderer, options);
}

function createWebGlCosmos(renderer: WebGLRenderer, options: CosmosOptions): Cosmos {
  const random = options.random ?? Math.random;
  const motion = options.reducedMotion ? 0 : 1;
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  renderer.autoClear = false;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, pixelRatioCap(options.quality));
  renderer.setPixelRatio(pixelRatio);
  const nebulaScale = options.quality === "high" ? 0.5 : 0.4;

  const screenCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 200);
  camera.position.set(0, 0, CAMERA_Z);

  // Palette state: the nebula blends from `paletteFrom` to `paletteTo`.
  let targetPalette = options.palette;
  let paletteTo: RgbPalette = paletteToRgb(options.palette);
  let paletteFrom: RgbPalette = paletteTo;
  let paletteNow: RgbPalette = paletteTo;
  let paletteTween: Tween | null = null;

  // Nebula pass at low resolution.
  const nebulaTarget = new WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    magFilter: LinearFilter,
    minFilter: LinearFilter,
  });
  const nebulaUniforms: Uniforms = {
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDrift: { value: new Vector2() },
    uDeep: { value: new Color() },
    uMid: { value: new Color() },
    uGlow: { value: new Color() },
    uAccent: { value: new Color() },
  };
  const seed = options.nebulaSeed ?? [10.2, 9];
  const baseDrift = new Vector2(seed[0], seed[1]);
  const fullscreenGeometry = new PlaneGeometry(2, 2);
  const nebulaMaterial = new ShaderMaterial({
    uniforms: nebulaUniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: NEBULA_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const nebulaScene = new Scene();
  const nebulaMesh = new Mesh(fullscreenGeometry, nebulaMaterial);
  nebulaMesh.frustumCulled = false;
  nebulaScene.add(nebulaMesh);

  const compositeUniforms: Uniforms = {
    tNebula: { value: nebulaTarget.texture },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uGrain: { value: 0.05 },
    uExposure: { value: 1 },
    uFocusPos: { value: new Vector2(0.5, 0.5) },
    uFocusColor: { value: new Color(0, 0, 0) },
    uFocusStrength: { value: 0 },
    uFocusRadius: { value: 0.2 },
  };
  const compositeMaterial = new ShaderMaterial({
    uniforms: compositeUniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COMPOSITE_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const compositeScene = new Scene();
  const compositeMesh = new Mesh(fullscreenGeometry, compositeMaterial);
  compositeMesh.frustumCulled = false;
  compositeScene.add(compositeMesh);

  // Descent: one full-screen pass that replaces the sky while a journey runs.
  const journeyUniforms: Uniforms = {
    uProgress: { value: 0 },
    uZoom: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uDeep: { value: new Color() },
    uMid: { value: new Color() },
    uGlow: { value: new Color() },
    uAccent: { value: new Color() },
    uShellColor: { value: new Color() },
    uNucleusColor: { value: new Color() },
    uShells: { value: new Vector4() },
    uShells2: { value: new Vector4() },
    uPair: { value: 0 },
  };
  const journeyMaterial = new ShaderMaterial({
    uniforms: journeyUniforms,
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: JOURNEY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const journeyScene = new Scene();
  const journeyMesh = new Mesh(fullscreenGeometry, journeyMaterial);
  journeyMesh.frustumCulled = false;
  journeyScene.add(journeyMesh);
  let journeyState: { progress: number; onProgress: ((progress: number) => void) | undefined } | null = null;

  // Star field: instanced quads spread through a deep box in front of the camera.
  const scene = new Scene();
  const starCount = options.quality === "high" ? 2600 : 1400;
  const starBase = new PlaneGeometry(1, 1);
  const starGeometry = new InstancedBufferGeometry();
  starGeometry.index = starBase.index;
  starGeometry.setAttribute("position", starBase.getAttribute("position"));
  const starPositions = new Float32Array(starCount * 3);
  const starLooks = new Float32Array(starCount * 4);
  for (let index = 0; index < starCount; index += 1) {
    let x = (random() * 2 - 1) * 60;
    let y = (random() * 2 - 1) * 40;
    // Keep stars off the camera axis so none flies straight through the viewer.
    while (Math.abs(x) < 1.4 && Math.abs(y) < 1.4) {
      x = (random() * 2 - 1) * 60;
      y = (random() * 2 - 1) * 40;
    }
    starPositions.set([x, y, random() * STAR_DEPTH], index * 3);
    const sizeRoll = random();
    starLooks.set(
      [1.05 + sizeRoll ** 5 * 3.4, random(), random() ** 2, 0.5 + random() ** 3 * 1.4],
      index * 4,
    );
  }
  starGeometry.setAttribute("aStar", new InstancedBufferAttribute(starPositions, 3));
  starGeometry.setAttribute("aLook", new InstancedBufferAttribute(starLooks, 4));
  starGeometry.instanceCount = starCount;
  const starUniforms: Uniforms = {
    uTravel: { value: 0 },
    uDepth: { value: STAR_DEPTH },
    uNear: { value: STAR_NEAR },
    uWarp: { value: 0 },
    uStreak: { value: 7 * motion },
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uTwinkle: { value: motion },
    uScroll: { value: 0 },
    uViewport: { value: new Vector2(1, 1) },
    uParallax: { value: new Vector2(0, 0) },
    uCool: { value: color("#d4e2ff") },
    uWarm: { value: color("#ffd8ad") },
    uTint: { value: new Color() },
  };
  const starMaterial = new ShaderMaterial({
    uniforms: starUniforms,
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const stars = new Mesh(starGeometry, starMaterial);
  stars.frustumCulled = false;
  stars.renderOrder = -5;
  scene.add(stars);

  const sphereGeometry = new SphereGeometry(1, 64, 48);
  const sphereGeometryLow = new SphereGeometry(1, 32, 24);
  const glowGeometry = new PlaneGeometry(1, 1);
  const orbitGeometry = buildOrbitGeometry(160);

  const bodies = new Set<BodyInternals>();
  const highlightValue = new WeakMap<BodyInternals, number>();
  const orbits = new Set<{ update(frame: FrameInfo): void; dispose(): void }>();
  let focused: BodyInternals | null = null;
  let focusStrength = 0;

  let warp = 0;
  let warpTween: Tween | null = null;
  let travelDistance = 0;
  const parallax = new Vector2();
  const parallaxTarget = new Vector2();
  let time = 0;
  let last = performance.now();
  let frameHandle = 0;
  let running = false;
  let disposed = false;
  const viewport = { width: 1, height: 1 };

  const resize = (): void => {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (width === viewport.width && height === viewport.height) return;
    viewport.width = width;
    viewport.height = height;
    renderer.setSize(width, height, false);
    nebulaTarget.setSize(Math.max(2, Math.round(width * nebulaScale)), Math.max(2, Math.round(height * nebulaScale)));
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const aspect = width / height;
    nebulaUniforms.uAspect!.value = aspect;
    compositeUniforms.uAspect!.value = aspect;
    journeyUniforms.uAspect!.value = aspect;
    (starUniforms.uViewport!.value as Vector2).set(width * pixelRatio, height * pixelRatio);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    const nx = event.clientX / Math.max(1, viewport.width) - 0.5;
    const ny = event.clientY / Math.max(1, viewport.height) - 0.5;
    parallaxTarget.set(-nx * 1.6 * motion, ny * 1.0 * motion);
  };
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  const onVisibility = (): void => {
    if (document.hidden) stopLoop();
    else if (running) startLoop();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onContextLost = (event: Event): void => event.preventDefault();
  canvas.addEventListener("webglcontextlost", onContextLost);

  const frame = (now: number): void => {
    frameHandle = 0;
    if (disposed || !running) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    time += dt;
    resize();

    if (journeyState) {
      // Zoom depth follows a smooth curve, so the fall eases in, races, and settles at the atom.
      const p = journeyState.progress;
      journeyUniforms.uProgress!.value = p;
      journeyUniforms.uZoom!.value = 8 * p * p * (3 - 2 * p);
      journeyUniforms.uTime!.value = time;
      journeyState.onProgress?.(p);
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(journeyScene, screenCamera);
      frameHandle = requestAnimationFrame(frame);
      return;
    }

    const fov = FOV + warp * 16 * motion;
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    travelDistance += (0.9 * motion + warp * warp * 170 * motion) * dt;
    parallax.set(damp(parallax.x, parallaxTarget.x, 2.5, dt), damp(parallax.y, parallaxTarget.y, 2.5, dt));

    // Nebula and composite.
    setColor(nebulaUniforms.uDeep!, paletteNow.deep);
    setColor(nebulaUniforms.uMid!, paletteNow.mid);
    setColor(nebulaUniforms.uGlow!, paletteNow.glow);
    setColor(nebulaUniforms.uAccent!, paletteNow.accent);
    nebulaUniforms.uTime!.value = time * motion + warp * 6;
    const scroll = window.scrollY || 0;
    (nebulaUniforms.uDrift!.value as Vector2).set(
      baseDrift.x + parallax.x * 0.025,
      baseDrift.y + parallax.y * 0.025 + scroll * 0.00035,
    );
    compositeUniforms.uTime!.value = motion ? time : 0;

    // Stars.
    starUniforms.uTravel!.value = travelDistance;
    starUniforms.uWarp!.value = warp * motion;
    starUniforms.uTime!.value = time;
    starUniforms.uScroll!.value = scroll * 0.002;
    (starUniforms.uParallax!.value as Vector2).copy(parallax);
    setColor(starUniforms.uTint!, paletteNow.glow);

    const info: FrameInfo = {
      time: time * motion,
      dt,
      viewport,
      fov,
      cover: coverRadius(viewport, fov, CAMERA_Z),
      unitsPerPx: unitsPerPixel(viewport, fov, CAMERA_Z),
      ambient: [
        paletteNow.deep[0] * 0.6 + paletteNow.mid[0] * 0.35,
        paletteNow.deep[1] * 0.6 + paletteNow.mid[1] * 0.35,
        paletteNow.deep[2] * 0.6 + paletteNow.mid[2] * 0.35,
      ],
      motion,
    };
    // Bodies: measure anchors, then let the travelling body (if any) lead a camera move that
    // sweeps every other body outward past the viewer, as a real approach would.
    let leader: BodyInternals | null = null;
    for (const body of bodies) {
      body.measure(info);
      if (body.travelProgress > 0 && (!leader || body.travelProgress > leader.travelProgress)) leader = body;
    }
    let dolly: Dolly | null = null;
    if (leader) {
      leader.place(info, null);
      dolly = {
        tx: leader.disc.x,
        ty: leader.disc.y,
        cx: leader.placed.x,
        cy: leader.placed.y,
        zoom: leader.placed.radius / Math.max(1e-3, leader.disc.radius),
      };
    }
    for (const body of bodies) if (body !== leader) body.place(info, dolly);
    for (const orbit of orbits) orbit.update(info);

    // Focus light around the focused body.
    const focusVisible = focused !== null && focused.visible && !focused.removed;
    focusStrength = damp(focusStrength, focusVisible ? 0.55 : 0, 5, dt);
    if (focused && focusVisible) {
      const uv = worldToUv(focused.placed.x, focused.placed.y, viewport, fov, CAMERA_Z);
      (compositeUniforms.uFocusPos!.value as Vector2).set(uv.u, uv.v);
      setColor(compositeUniforms.uFocusColor!, focused.focusColor);
      compositeUniforms.uFocusRadius!.value = Math.max(0.12, (focused.placed.radius * 3.4) / visibleHeightAt(fov, CAMERA_Z));
    }
    compositeUniforms.uFocusStrength!.value = focusStrength;

    renderer.setRenderTarget(nebulaTarget);
    renderer.clear();
    renderer.render(nebulaScene, screenCamera);
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.render(compositeScene, screenCamera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    frameHandle = requestAnimationFrame(frame);
  };

  const startLoop = (): void => {
    if (frameHandle || disposed || document.hidden) return;
    last = performance.now();
    frameHandle = requestAnimationFrame(frame);
  };
  const stopLoop = (): void => {
    if (frameHandle) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  const lightDirection = (body: BodyInternals, source: BodyInternals | undefined, depth: number, out: Vector3): void => {
    if (!source || source.removed) {
      out.set(-0.55, 0.5, 0.65).normalize();
      return;
    }
    const dx = source.placed.x - body.placed.x;
    const dy = source.placed.y - body.placed.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-4) {
      out.set(-0.55, 0.5, 0.65).normalize();
      return;
    }
    out.set(dx, dy, length * depth).normalize();
  };

  const createBody = (
    root: Group,
    focusColor: Rgb,
    onUpdate: (frame: FrameInfo, body: BodyInternals) => void,
    disposeParts: () => void,
  ): BodyInternals => {
    let anchor: HTMLElement | null = null;
    let highlight = 0;
    let highlightTarget = 0;
    let travelTween: Tween | null = null;
    const body: BodyInternals = {
      root,
      focusColor,
      disc: { x: 0, y: 0, radius: 0 },
      placed: { x: 0, y: 0, radius: 0 },
      travelProgress: 0,
      visible: false,
      removed: false,
      anchorTo(element) {
        anchor = element;
      },
      setHighlight(on) {
        highlightTarget = on ? 1 : 0;
      },
      travel(target, durationMs) {
        travelTween?.cancel();
        const from = body.travelProgress;
        const effective = options.reducedMotion ? 0 : durationMs;
        travelTween = tween({
          durationMs: effective * Math.abs(target - from),
          onUpdate: (t) => {
            body.travelProgress = from + (target - from) * t;
          },
        });
        return travelTween.done;
      },
      setTravel(progress) {
        travelTween?.cancel();
        body.travelProgress = clamp01(progress);
      },
      remove() {
        if (body.removed) return;
        body.removed = true;
        travelTween?.cancel();
        bodies.delete(body);
        scene.remove(root);
        if (focused === body) focused = null;
        disposeParts();
      },
      measure(frameInfo) {
        if (anchor && anchor.isConnected) {
          const rect = anchor.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            body.disc = rectToWorld(rect, frameInfo.viewport, frameInfo.fov, CAMERA_Z);
            body.visible = true;
            return;
          }
        }
        body.visible = false;
      },
      place(frameInfo, dolly) {
        highlight = damp(highlight, highlightTarget, 7, frameInfo.dt);
        const p = body.travelProgress;
        let x: number;
        let y: number;
        let radius: number;
        if (p > 0 || !dolly) {
          const move = ease.inOutCubic(p);
          x = body.disc.x * (1 - move);
          y = body.disc.y * (1 - move);
          radius = zoomBetween(Math.max(1e-3, body.disc.radius), frameInfo.cover, p ** 1.8);
        } else {
          x = dolly.cx + (body.disc.x - dolly.tx) * dolly.zoom;
          y = dolly.cy + (body.disc.y - dolly.ty) * dolly.zoom;
          radius = body.disc.radius * dolly.zoom;
        }
        body.placed = { x, y, radius };
        root.visible = body.visible || p > 0;
        root.position.set(x, y, 0);
        root.scale.setScalar(radius * (1 + highlight * 0.07 * (1 - p)));
        highlightValue.set(body, highlight);
        onUpdate(frameInfo, body);
      },
      dispose() {
        disposeParts();
      },
    };
    bodies.add(body);
    scene.add(root);
    return body;
  };

  const planetMaterial = (style: PlanetOptions["style"], colors: readonly [string, string, string], atmosphere: string, seed: number): ShaderMaterial =>
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uLightDir: { value: new Vector3(-0.5, 0.5, 0.7) },
        uColorA: { value: color(colors[0]) },
        uColorB: { value: color(colors[1]) },
        uColorC: { value: color(colors[2]) },
        uAtmosphere: { value: color(atmosphere) },
        uAmbient: { value: new Color() },
        uHighlight: { value: 0 },
        uSeed: { value: seed },
      },
      defines: { [`STYLE_${style.toUpperCase()}`]: 1 },
      vertexShader: SPHERE_VERTEX,
      fragmentShader: PLANET_FRAGMENT,
    });

  const cosmos: Cosmos = {
    supported: true,
    element: canvas,
    get palette() {
      return targetPalette;
    },
    setPalette(palette, durationMs = 1200) {
      targetPalette = palette;
      paletteTween?.cancel();
      paletteFrom = paletteNow;
      paletteTo = paletteToRgb(palette);
      paletteTween = tween({
        durationMs,
        easing: ease.inOutSine,
        onUpdate: (t) => {
          paletteNow = mixVividPalette(paletteFrom, paletteTo, t);
        },
      });
    },
    warpTo(amount, durationMs, easing = ease.inOutCubic) {
      warpTween?.cancel();
      const from = warp;
      const to = clamp01(amount);
      warpTween = tween({
        durationMs: options.reducedMotion ? 0 : durationMs,
        easing,
        onUpdate: (t) => {
          warp = from + (to - from) * t;
        },
      });
      return warpTween.done;
    },
    addPlanet(planetOptions) {
      const root = new Group();
      const tilt = new Group();
      tilt.rotation.z = planetOptions.tilt ?? 0.35;
      root.add(tilt);
      const spinner = new Group();
      tilt.add(spinner);
      const seed = planetOptions.seed ?? random() * 10;
      const geometry = (planetOptions.segments ?? 64) >= 64 ? sphereGeometry : sphereGeometryLow;
      const surface = planetMaterial(planetOptions.style, planetOptions.colors, planetOptions.atmosphere, seed);
      spinner.add(new Mesh(geometry, surface));

      const haloEdge = (() => {
        const scale = planetOptions.haloScale ?? 1.14;
        return Math.sqrt(1 - 1 / (scale * scale));
      })();
      const halo = new ShaderMaterial({
        uniforms: {
          uAtmosphere: { value: color(planetOptions.atmosphere) },
          uLightDir: { value: new Vector3(-0.5, 0.5, 0.7) },
          uStrength: { value: planetOptions.haloStrength ?? 1 },
          uEdge: { value: haloEdge },
        },
        vertexShader: SPHERE_VERTEX,
        fragmentShader: HALO_FRAGMENT,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const haloMesh = new Mesh(geometry, halo);
      haloMesh.scale.setScalar(planetOptions.haloScale ?? 1.14);
      root.add(haloMesh);

      const ringMaterials: ShaderMaterial[] = [];
      const ringGeometries: TorusGeometry[] = [];
      const ringGroup = new Group();
      root.add(ringGroup);
      if (planetOptions.rings) {
        for (let index = 0; index < planetOptions.rings.count; index += 1) {
          const radius = 1.42 + index * 0.3;
          const ringGeometry = new TorusGeometry(radius, 0.014, 6, 180);
          ringGeometries.push(ringGeometry);
          const material = new ShaderMaterial({
            uniforms: {
              uColor: { value: color(planetOptions.rings.color) },
              uTime: { value: 0 },
              uSpeed: { value: 0.16 - index * 0.035 },
              uPhase: { value: random() },
              uOpacity: { value: 1 },
            },
            vertexShader: RING_VERTEX,
            fragmentShader: RING_FRAGMENT,
            blending: AdditiveBlending,
            transparent: true,
            depthWrite: false,
          });
          ringMaterials.push(material);
          const ring = new Mesh(ringGeometry, material);
          ring.rotation.set(1.18 + index * 0.16, index * 0.9 - 0.4, index * 0.55);
          ringGroup.add(ring);
        }
      }

      let moonPivot: Group | null = null;
      let moonSurface: ShaderMaterial | null = null;
      if (planetOptions.moon) {
        moonPivot = new Group();
        moonPivot.rotation.x = 0.32;
        moonPivot.rotation.z = -0.22;
        root.add(moonPivot);
        moonSurface = planetMaterial("crystal", planetOptions.moon.colors, planetOptions.moon.atmosphere, seed + 3.7);
        const moon = new Mesh(sphereGeometryLow, moonSurface);
        moon.scale.setScalar(planetOptions.moon.size ?? 0.26);
        moon.position.set(1.72, 0, 0);
        moonPivot.add(moon);
      }

      const light = new Vector3();
      const spin = planetOptions.spin ?? 0.08;
      const lightDepth = planetOptions.lightDepth ?? 0.6;
      const source = planetOptions.lightFrom as BodyInternals | undefined;
      const body = createBody(
        root,
        hexToRgb(planetOptions.atmosphere),
        (frameInfo, self) => {
          const p = self.travelProgress;
          spinner.rotation.y += spin * (1 + p * 4) * frameInfo.dt * (frameInfo.motion || 0.15);
          lightDirection(self, source, lightDepth, light);
          const highlight = highlightValue.get(self) ?? 0;
          const surfaceUniforms = surface.uniforms;
          surfaceUniforms.uTime!.value = frameInfo.time;
          (surfaceUniforms.uLightDir!.value as Vector3).copy(light);
          setColor(surfaceUniforms.uAmbient!, frameInfo.ambient);
          surfaceUniforms.uHighlight!.value = highlight;
          (halo.uniforms.uLightDir!.value as Vector3).copy(light);
          halo.uniforms.uStrength!.value = (planetOptions.haloStrength ?? 1) * (1 + highlight * 0.6) * (1 - p * 0.6);
          const extrasOpacity = 1 - clamp01(p / 0.35);
          ringGroup.visible = extrasOpacity > 0.01;
          for (const material of ringMaterials) {
            material.uniforms.uTime!.value = frameInfo.time;
            material.uniforms.uOpacity!.value = extrasOpacity * (1 + highlight * 0.5);
          }
          if (moonPivot && moonSurface) {
            moonPivot.visible = extrasOpacity > 0.01;
            moonPivot.rotation.y += 0.45 * frameInfo.dt * (frameInfo.motion || 0.1);
            const moonUniforms = moonSurface.uniforms;
            moonUniforms.uTime!.value = frameInfo.time;
            (moonUniforms.uLightDir!.value as Vector3).copy(light);
            setColor(moonUniforms.uAmbient!, frameInfo.ambient);
          }
        },
        () => {
          surface.dispose();
          halo.dispose();
          moonSurface?.dispose();
          for (const material of ringMaterials) material.dispose();
          for (const ringGeometry of ringGeometries) ringGeometry.dispose();
        },
      );
      return body;
    },
    addStar(starOptions) {
      const root = new Group();
      const sun = new ShaderMaterial({
        uniforms: {
          uCore: { value: color(starOptions.core) },
          uEdge: { value: color(starOptions.edge) },
          uTime: { value: 0 },
          uIntensity: { value: starOptions.intensity ?? 1 },
        },
        vertexShader: SPHERE_VERTEX,
        fragmentShader: SUN_FRAGMENT,
      });
      root.add(new Mesh(sphereGeometryLow, sun));
      const glow = new ShaderMaterial({
        uniforms: {
          uColor: { value: color(starOptions.edge) },
          uTime: { value: 0 },
          uIntensity: { value: starOptions.intensity ?? 1 },
          uSpikes: { value: starOptions.spikes ?? 0.5 },
          uSeed: { value: starOptions.seed ?? random() * 10 },
        },
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const glowMesh = new Mesh(glowGeometry, glow);
      const glowScale = (starOptions.glowScale ?? 3.6) * 2;
      glowMesh.scale.setScalar(glowScale);
      glowMesh.position.z = 0.02;
      glowMesh.renderOrder = 2;
      root.add(glowMesh);
      const baseIntensity = starOptions.intensity ?? 1;
      return createBody(
        root,
        hexToRgb(starOptions.edge),
        (frameInfo, self) => {
          const highlight = highlightValue.get(self) ?? 0;
          sun.uniforms.uTime!.value = frameInfo.time;
          glow.uniforms.uTime!.value = frameInfo.time;
          const pulse = 1 + Math.sin(frameInfo.time * 0.9) * 0.04;
          glow.uniforms.uIntensity!.value = baseIntensity * (1 + highlight * 0.45) * pulse;
          glowMesh.scale.setScalar(glowScale * (1 + highlight * 0.12));
        },
        () => {
          sun.dispose();
          glow.dispose();
        },
      );
    },
    addOrbit(star, planet, orbitOptions) {
      const starBody = star as BodyInternals;
      const planetBody = planet as BodyInternals;
      const material = new ShaderMaterial({
        uniforms: {
          uCenter: { value: new Vector2() },
          uRadii: { value: new Vector2(1, 1) },
          uHalfWidth: { value: 0.01 },
          uColor: { value: color(orbitOptions.color) },
          uTime: { value: 0 },
          uSpeed: { value: orbitOptions.speed ?? 0.035 },
          uPhase: { value: orbitOptions.phase ?? random() },
          uOpacity: { value: 1 },
        },
        vertexShader: ORBIT_VERTEX,
        fragmentShader: ORBIT_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new Mesh(orbitGeometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = -1;
      scene.add(mesh);
      const handle = {
        update(frameInfo: FrameInfo) {
          const visible = starBody.visible && planetBody.visible && !starBody.removed && !planetBody.removed;
          const opacity = visible ? 1 - clamp01(planetBody.travelProgress * 3) : 0;
          mesh.visible = opacity > 0.01;
          if (!mesh.visible) return;
          const dx = planetBody.placed.x - starBody.placed.x;
          const dy = planetBody.placed.y - starBody.placed.y;
          const ellipse = orbitThrough(dx, dy, orbitOptions.widen ?? 1.2);
          (material.uniforms.uCenter!.value as Vector2).set(starBody.placed.x, starBody.placed.y);
          (material.uniforms.uRadii!.value as Vector2).set(ellipse.a, ellipse.b);
          material.uniforms.uHalfWidth!.value = frameInfo.unitsPerPx * 0.8;
          material.uniforms.uTime!.value = frameInfo.time;
          material.uniforms.uOpacity!.value = opacity;
        },
        dispose() {
          scene.remove(mesh);
          material.dispose();
        },
      };
      orbits.add(handle);
      return {
        remove() {
          if (!orbits.delete(handle)) return;
          handle.dispose();
        },
      };
    },
    focus(body) {
      focused = (body as BodyInternals | null) ?? null;
    },
    startJourney(journeyOptions) {
      const colors = paletteToRgb(journeyOptions.palette);
      setColor(journeyUniforms.uDeep!, colors.deep);
      setColor(journeyUniforms.uMid!, colors.mid);
      setColor(journeyUniforms.uGlow!, colors.glow);
      setColor(journeyUniforms.uAccent!, colors.accent);
      setColor(journeyUniforms.uShellColor!, hexToRgb(journeyOptions.shellColor));
      setColor(journeyUniforms.uNucleusColor!, hexToRgb(journeyOptions.nucleusColor));
      const shells = journeyOptions.shells;
      (journeyUniforms.uShells!.value as Vector4).set(shells[0] ?? 0, shells[1] ?? 0, shells[2] ?? 0, shells[3] ?? 0);
      const second = journeyOptions.secondShells;
      (journeyUniforms.uShells2!.value as Vector4).set(second?.[0] ?? 0, second?.[1] ?? 0, second?.[2] ?? 0, second?.[3] ?? 0);
      journeyUniforms.uPair!.value = second ? 1 : 0;
      const from = clamp01(journeyOptions.from ?? 0);
      const state = { progress: from, onProgress: journeyOptions.onProgress };
      journeyState = state;
      let resolve: () => void = () => undefined;
      const arrived = new Promise<void>((settle) => {
        resolve = settle;
      });
      let progressTween: Tween | null = null;
      const runTo = (durationMs: number, easing: Easing): void => {
        progressTween?.cancel();
        const start = state.progress;
        progressTween = tween({
          durationMs,
          easing,
          onUpdate: (t) => {
            state.progress = start + (1 - start) * t;
            if (t >= 1) resolve();
          },
        });
      };
      runTo(journeyOptions.durationMs * (1 - from), ease.linear);
      return {
        arrived,
        get progress() {
          return state.progress;
        },
        skip() {
          if (state.progress < 1) runTo(450, ease.inOutSine);
        },
        stop() {
          progressTween?.cancel();
          resolve();
          if (journeyState === state) journeyState = null;
        },
      };
    },
    snapshot(palette) {
      try {
        resize();
        const colors = paletteToRgb(palette);
        setColor(nebulaUniforms.uDeep!, colors.deep);
        setColor(nebulaUniforms.uMid!, colors.mid);
        setColor(nebulaUniforms.uGlow!, colors.glow);
        setColor(nebulaUniforms.uAccent!, colors.accent);
        (nebulaUniforms.uDrift!.value as Vector2).copy(baseDrift);
        nebulaUniforms.uTime!.value = time * motion;
        compositeUniforms.uFocusStrength!.value = 0;
        starUniforms.uWarp!.value = 0;
        starUniforms.uScroll!.value = 0;
        setColor(starUniforms.uTint!, colors.glow);
        renderer.setRenderTarget(nebulaTarget);
        renderer.clear();
        renderer.render(nebulaScene, screenCamera);
        renderer.setRenderTarget(null);
        renderer.clear();
        renderer.render(compositeScene, screenCamera);
        renderer.clearDepth();
        renderer.render(scene, camera);
        // Read back in the same task, before the browser presents and clears the buffer.
        const url = canvas.toDataURL("image/jpeg", 0.86);
        if (journeyState) {
          // Put the descent back so this frame never flashes.
          renderer.clear();
          renderer.render(journeyScene, screenCamera);
        }
        return url;
      } catch {
        return null;
      }
    },
    setRunning(next) {
      running = next;
      canvas.style.visibility = next ? "visible" : "hidden";
      if (next) startLoop();
      else stopLoop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stopLoop();
      paletteTween?.cancel();
      warpTween?.cancel();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      for (const body of [...bodies]) body.remove();
      for (const orbit of [...orbits]) orbit.dispose();
      orbits.clear();
      nebulaMaterial.dispose();
      compositeMaterial.dispose();
      journeyMaterial.dispose();
      starMaterial.dispose();
      starGeometry.dispose();
      starBase.dispose();
      fullscreenGeometry.dispose();
      sphereGeometry.dispose();
      sphereGeometryLow.dispose();
      glowGeometry.dispose();
      orbitGeometry.dispose();
      nebulaTarget.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  return cosmos;
}

/** A ribbon of `segments` steps: each vertex holds its angle and which edge (-1 or 1) it is on. */
function buildOrbitGeometry(segments: number): BufferGeometry {
  const data = new Float32Array((segments + 1) * 2 * 2);
  const indices: number[] = [];
  for (let step = 0; step <= segments; step += 1) {
    const angle = (step / segments) * Math.PI * 2;
    data.set([angle, -1, angle, 1], step * 4);
    if (step < segments) {
      const a = step * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("aOrbit", new BufferAttribute(data, 2));
  // three.js needs a position attribute to count vertices; the shader ignores it.
  geometry.setAttribute("position", new BufferAttribute(new Float32Array((segments + 1) * 2 * 3), 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Without WebGL: a CSS gradient that still follows the palette. Bodies are invisible no-ops. */
function createFallbackCosmos(palette: CosmosPalette): Cosmos {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  element.className = "cosmos-fallback";
  element.style.position = "absolute";
  element.style.inset = "0";
  element.style.transition = "background 1.2s ease";
  let current = palette;
  element.style.background = paletteGradient(palette);
  const noopBody: CelestialBody = {
    anchorTo: () => undefined,
    setHighlight: () => undefined,
    travel: () => Promise.resolve(),
    setTravel: () => undefined,
    remove: () => undefined,
  };
  return {
    supported: false,
    element,
    get palette() {
      return current;
    },
    setPalette(next) {
      current = next;
      element.style.background = paletteGradient(next);
    },
    warpTo: () => Promise.resolve(),
    addPlanet: () => noopBody,
    addStar: () => noopBody,
    addOrbit: () => ({ remove: () => undefined }),
    focus: () => undefined,
    startJourney: () => ({ arrived: Promise.resolve(), progress: 1, skip: () => undefined, stop: () => undefined }),
    snapshot: () => null,
    setRunning: (running) => {
      element.style.visibility = running ? "visible" : "hidden";
    },
    dispose: () => element.remove(),
  };
}
