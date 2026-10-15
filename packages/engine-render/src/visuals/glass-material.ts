import * as THREE from "three";
import {
  xrTokens,
  type GlassLayer,
  type GlassSurfaceVariant,
} from "../xr-tokens.js";

export interface GlassSurfaceSize {
  readonly width: number;
  readonly height: number;
}

export interface GlassSurfaceState {
  readonly hover?: boolean;
  readonly pressed?: boolean;
  readonly selected?: boolean;
  readonly disabled?: boolean;
}

export interface GlassSurfaceOptions {
  readonly reduced?: boolean;
}

export type GlassMaterial = THREE.ShaderMaterial;
export type GlassSurface = THREE.Mesh<THREE.PlaneGeometry, GlassMaterial>;

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 size;
  uniform float radius;
  uniform vec4 tint;
  uniform vec3 rimColor;
  uniform float rimWidth;
  uniform float rimAlpha;
  uniform float highlightAlpha;
  uniform float innerShadowAlpha;
  uniform float noiseAmount;
  uniform float hover;
  uniform float pressed;
  uniform float selected;
  uniform float disabled;
  uniform float reduced;
  uniform float hoverBrightness;
  uniform float hoverRim;
  uniform float pressedBrightness;
  uniform float pressedRim;
  uniform float selectedBrightness;
  uniform float selectedRim;
  uniform float disabledBrightness;
  uniform float disabledRim;
  varying vec2 vUv;

  float roundedRectDistance(vec2 point, vec2 halfSize, float cornerRadius) {
    vec2 q = abs(point) - halfSize + cornerRadius;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - cornerRadius;
  }

  float stableNoise(vec2 point) {
    return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  }

  void main() {
    vec2 point = (vUv - 0.5) * size;
    vec2 halfSize = size * 0.5;
    float cornerRadius = min(radius, min(halfSize.x, halfSize.y));
    float distanceToEdge = roundedRectDistance(point, halfSize, cornerRadius);
    float antialias = max(fwidth(distanceToEdge), 0.000001);
    float coverage = 1.0 - smoothstep(-antialias, antialias, distanceToEdge);
    if (coverage <= 0.0) discard;

    float edgeDistance = abs(distanceToEdge);
    float rim = 1.0 - smoothstep(rimWidth - antialias, rimWidth + antialias, edgeDistance);
    float diagonal = (point.x / max(halfSize.x, antialias)) +
      (point.y / max(halfSize.y, antialias));
    float topLeftHighlight = exp(-pow((diagonal + 1.45) * 2.1, 2.0)) *
      smoothstep(-0.15, 0.7, point.y / max(halfSize.y, antialias));
    float innerShadow = smoothstep(0.0, max(cornerRadius, antialias), -distanceToEdge);

    float brightness = 1.0 +
      hover * hoverBrightness +
      pressed * pressedBrightness +
      selected * selectedBrightness +
      disabled * disabledBrightness;
    float rimScale = max(
      0.0,
      1.0 + hover * hoverRim + pressed * pressedRim +
        selected * selectedRim + disabled * disabledRim
    );
    float noise = stableNoise(gl_FragCoord.xy) * noiseAmount * (1.0 - reduced);
    vec3 surfaceColor = max(vec3(0.0), tint.rgb * brightness + vec3(noise));
    float highlight = topLeftHighlight * highlightAlpha * (1.0 - reduced);
    float shadow = innerShadow * innerShadowAlpha * (1.0 - reduced);
    vec3 color = surfaceColor +
      rimColor * rim * rimAlpha * rimScale +
      rimColor * highlight -
      surfaceColor * shadow;
    float alpha = clamp(
      tint.a * coverage + rim * rimAlpha * rimScale +
        highlight * tint.a,
      0.0,
      1.0
    );
    gl_FragColor = vec4(max(color, vec3(0.0)) * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const glassLayers: Readonly<Record<GlassSurfaceVariant, GlassLayer>> = {
  shell: "shell",
  panel: "panel",
  card: "panel",
  control: "control",
  pill: "control",
};

const materials = new Map<GlassSurfaceVariant, GlassMaterial>();
const surfaceCounts = new Map<GlassSurfaceVariant, number>();
const states = new WeakMap<GlassSurface, GlassSurfaceState>();
const reducedGlass = new WeakMap<GlassSurface, boolean>();
const disposedSurfaces = new WeakSet<GlassSurface>();

function colorToLinear(hex: string): THREE.Color {
  return new THREE.Color(hex);
}

function createMaterial(variant: GlassSurfaceVariant): GlassMaterial {
  const glass = xrTokens.glass;
  const variantTokens = glass.variants[variant];
  const layer = xrTokens.layers[glassLayers[variant]];
  const tintColor = colorToLinear(variantTokens.tint.rgb);
  const material = new THREE.ShaderMaterial({
    name: `glass-${variant}`,
    vertexShader,
    fragmentShader,
    uniforms: {
      size: { value: new THREE.Vector2(1, 1) },
      radius: { value: variantTokens.radiusM },
      tint: {
        value: new THREE.Vector4(
          tintColor.r,
          tintColor.g,
          tintColor.b,
          variantTokens.tint.alpha,
        ),
      },
      rimColor: { value: colorToLinear(glass.rimColor) },
      rimWidth: { value: variantTokens.rimWidthM },
      rimAlpha: { value: glass.rimAlpha },
      highlightAlpha: { value: glass.highlightAlpha },
      innerShadowAlpha: { value: glass.innerShadowAlpha },
      noiseAmount: { value: glass.noiseAmount },
      hover: { value: 0 },
      pressed: { value: 0 },
      selected: { value: 0 },
      disabled: { value: 0 },
      reduced: { value: 0 },
      hoverBrightness: { value: glass.states.hoverBrightness },
      hoverRim: { value: glass.states.hoverRim },
      pressedBrightness: { value: glass.states.pressedBrightness },
      pressedRim: { value: glass.states.pressedRim },
      selectedBrightness: { value: glass.states.selectedBrightness },
      selectedRim: { value: glass.states.selectedRim },
      disabledBrightness: { value: glass.states.disabledBrightness },
      disabledRim: { value: glass.states.disabledRim },
    },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    toneMapped: false,
    side: THREE.FrontSide,
  });
  material.userData.renderOrder = layer.renderOrder;
  return material;
}

function materialFor(variant: GlassSurfaceVariant): GlassMaterial {
  let material = materials.get(variant);
  if (!material) {
    material = createMaterial(variant);
    materials.set(variant, material);
  }
  return material;
}

/** Copy per-surface state into the shared material immediately before rendering. */
export function updateGlassSurfaceUniforms(surface: GlassSurface): void {
  const material = surface.material;
  const state = states.get(surface) ?? {};
  const variant = surface.userData.glassVariant as GlassSurfaceVariant;
  const variantTokens = xrTokens.glass.variants[variant];
  const uniforms = material.uniforms;
  uniforms.size!.value.set(surface.geometry.parameters.width, surface.geometry.parameters.height);
  uniforms.radius!.value = variantTokens.radiusM;
  uniforms.rimWidth!.value = variantTokens.rimWidthM;
  uniforms.hover!.value = Number(state.hover ?? false);
  uniforms.pressed!.value = Number(state.pressed ?? false);
  uniforms.selected!.value = Number(state.selected ?? false);
  uniforms.disabled!.value = Number(state.disabled ?? false);
  uniforms.reduced!.value = Number(reducedGlass.get(surface) ?? false);
  material.uniformsNeedUpdate = true;
}

/** Create a rounded, transparent glass surface using the cached variant material. */
export function createGlassSurface(
  variant: GlassSurfaceVariant,
  size: GlassSurfaceSize,
  options: GlassSurfaceOptions = {},
): GlassSurface {
  if (!Number.isFinite(size.width) || size.width <= 0 ||
    !Number.isFinite(size.height) || size.height <= 0) {
    throw new RangeError("Glass surface dimensions must be finite and positive.");
  }
  const layer = xrTokens.layers[glassLayers[variant]];
  const geometry = new THREE.PlaneGeometry(size.width, size.height);
  const surface = new THREE.Mesh(geometry, materialFor(variant));
  surface.name = `glass-surface-${variant}`;
  surface.position.z = layer.zOffsetM;
  surface.renderOrder = layer.renderOrder;
  surface.userData.glassVariant = variant;
  states.set(surface, {});
  reducedGlass.set(surface, options.reduced ?? false);
  surfaceCounts.set(variant, (surfaceCounts.get(variant) ?? 0) + 1);
  surface.onBeforeRender = () => updateGlassSurfaceUniforms(surface);
  return surface;
}

/** Set per-surface interaction flags without changing other shared-material surfaces. */
export function setGlassSurfaceState(
  surface: GlassSurface,
  state: GlassSurfaceState,
): void {
  states.set(surface, state);
}

/** Release one surface's quad geometry; cached variant materials stay shared. */
export function disposeGlassSurface(surface: GlassSurface): void {
  if (disposedSurfaces.has(surface)) return;
  disposedSurfaces.add(surface);
  surface.removeFromParent();
  surface.geometry.dispose();
  const variant = surface.userData.glassVariant as GlassSurfaceVariant;
  const count = (surfaceCounts.get(variant) ?? 1) - 1;
  if (count > 0) {
    surfaceCounts.set(variant, count);
    return;
  }
  surfaceCounts.delete(variant);
  materials.get(variant)?.dispose();
  materials.delete(variant);
}
