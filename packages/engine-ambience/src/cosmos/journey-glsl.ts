import { NOISE_GLSL } from "./glsl.js";

/**
 * The descent: one full-screen pass that falls through an atmosphere, then down through endless
 * layers of packed particles, and arrives at a single atom with glowing shells.
 *
 * "Endless" zooms use layered octaves: each layer is the same pattern at twice the scale of the
 * next, fading in while small and out while large, so the zoom never runs out.
 */
export const JOURNEY_FRAGMENT = /* glsl */ `
uniform float uProgress;
uniform float uZoom;
uniform float uTime;
uniform float uAspect;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
uniform vec3 uAccent;
uniform vec3 uShellColor;
uniform vec3 uNucleusColor;
uniform vec4 uShells;
varying vec2 vUv;
${NOISE_GLSL}

const int LAYERS = 4;

vec2 turn(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Cloud decks rushing outward past the viewer.
vec3 clouds(vec2 p, float zoom) {
  float f = fract(zoom);
  float base = floor(zoom);
  vec3 sum = vec3(0.0);
  float weights = 0.0;
  for (int k = 0; k < LAYERS; k++) {
    float pos = (float(k) + f) / float(LAYERS);
    float w = sin(3.14159265 * pos);
    float scale = exp2(pos * float(LAYERS));
    float seed = float(k) - base;
    vec2 q = turn(p, seed * 0.7) / scale * 3.0;
    float n = mmaFbmLite(vec3(q + seed * 3.1, seed * 1.7 + uTime * 0.05));
    vec3 c = mix(uMid, uGlow, smoothstep(0.35, 0.85, n));
    c = mix(c, vec3(1.0), smoothstep(0.78, 1.0, n) * 0.45);
    sum += c * w * smoothstep(0.28, 0.75, n);
    weights += w;
  }
  return sum / max(weights, 0.001) * 1.5;
}

// Endless layers of packed particles, each a lattice inside the last.
vec3 lattice(vec2 p, float zoom) {
  float f = fract(zoom);
  float base = floor(zoom);
  vec3 sum = vec3(0.0);
  for (int k = 0; k < LAYERS; k++) {
    float pos = (float(k) + f) / float(LAYERS);
    float w = sin(3.14159265 * pos);
    float scale = exp2(pos * float(LAYERS));
    float seed = float(k) - base;
    vec2 q = turn(p, seed * 0.45) / scale * 14.0 + vec2(seed * 0.37, seed * 0.61);
    vec2 cell = fract(q) - 0.5;
    vec2 id = floor(q);
    float d2 = dot(cell, cell);
    float glowDot = exp(-d2 * 70.0) * 1.3 + exp(-d2 * 9.0) * 0.22;
    float bond = exp(-min(abs(cell.x), abs(cell.y)) * 60.0) * 0.1;
    float parity = mod(id.x + id.y, 2.0);
    vec3 c = mix(uGlow, uAccent, parity);
    sum += (c * glowDot + uMid * bond) * w;
  }
  return sum * 0.7;
}

// One atom: a glowing nucleus and tilted shells with electrons running along them.
vec3 atom(vec2 p, float s) {
  vec3 col = vec3(0.0);
  float r = length(p);
  float nr = 0.05 * s;
  float core = exp(-r * r / max(1e-6, nr * nr));
  float grains = mmaNoise3(vec3(p / max(nr, 1e-4) * 2.6, uTime * 0.6));
  col += uNucleusColor * core * (1.1 + 0.7 * grains);
  col += uNucleusColor * exp(-r / max(1e-4, nr * 3.2)) * 0.35;
  for (int i = 0; i < 4; i++) {
    float count = uShells[i];
    if (count < 0.5) continue;
    float radius = (0.15 + 0.1 * float(i)) * s;
    float squash = 0.36;
    vec2 q = turn(p, 0.5 + float(i) * 0.95);
    float e = length(vec2(q.x, q.y / squash));
    float width = max(0.0025, 0.0045 * s);
    float ring = exp(-pow((e - radius) / width, 2.0));
    float far = step(0.0, q.y);
    col += uShellColor * ring * mix(0.6, 0.22, far);
    float speed = 0.9 / (1.0 + float(i) * 0.6);
    for (int j = 0; j < 8; j++) {
      if (float(j) >= count) break;
      float a = uTime * speed + float(j) * 6.2831853 / count + float(i) * 1.3;
      vec2 ep = vec2(cos(a) * radius, sin(a) * radius * squash);
      float d = length(q - ep);
      float size = max(0.006, 0.011 * s);
      col += mix(vec3(1.0), uShellColor, 0.35) * (exp(-d * d / (size * size)) * 1.4 + exp(-d / (size * 2.5)) * 0.25);
    }
  }
  return col;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float pr = uProgress;
  float wClouds = 1.0 - smoothstep(0.2, 0.32, pr);
  float wLattice = smoothstep(0.18, 0.32, pr) * (1.0 - 0.8 * smoothstep(0.66, 0.86, pr));
  float wAtom = smoothstep(0.58, 0.8, pr);

  vec3 col = uDeep + uMid * 0.35 * max(0.0, 1.0 - length(p));
  if (wClouds > 0.001) col += clouds(p, uZoom) * wClouds;
  if (wLattice > 0.001) col += lattice(p, uZoom * 0.9 + 2.0) * wLattice;
  if (wAtom > 0.001) {
    float scale = exp2(clamp((pr - 0.9) / 0.32, -1.0, 0.0) * 8.0);
    col += atom(p, scale) * wAtom;
  }
  // The flash of breaking through the last cloud deck.
  col += mix(uGlow, vec3(1.0), 0.5) * exp(-pow((pr - 0.25) / 0.035, 2.0)) * 0.55;

  col *= mix(1.0, 0.4, smoothstep(0.3, 0.95, length(p)));
  float grain = mmaHash12(gl_FragCoord.xy + fract(uTime * 7.0) * 517.0) - 0.5;
  col += grain * 0.04 * (0.35 + col);
  col += (mmaHash12(gl_FragCoord.xy * 1.731 + 11.0) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;
