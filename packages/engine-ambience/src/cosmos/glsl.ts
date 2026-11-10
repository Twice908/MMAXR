/**
 * GLSL shared by the cosmos shaders. Value noise and hashes are written for this project; the
 * sine-free hash follows Dave Hoskins' "Hash without Sine" (MIT).
 */
export const NOISE_GLSL = /* glsl */ `
float mmaHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float mmaHash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 mmaHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float mmaNoise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = mmaHash3(i);
  float n100 = mmaHash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = mmaHash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = mmaHash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = mmaHash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = mmaHash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = mmaHash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = mmaHash3(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

float mmaFbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    sum += amplitude * mmaNoise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.4);
    amplitude *= 0.5;
  }
  return sum;
}

float mmaFbmLite(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 3; octave++) {
    sum += amplitude * mmaNoise3(p);
    p = p * 2.07 + vec3(4.1, 1.3, 7.7);
    amplitude *= 0.5;
  }
  return sum / 0.875;
}

// Distance to the nearest and second-nearest cell point, and the nearest cell's id.
vec2 mmaCells(vec3 x, out vec3 cellId) {
  vec3 base = floor(x);
  vec3 f = fract(x);
  float f1 = 8.0;
  float f2 = 8.0;
  cellId = base;
  for (int k = -1; k <= 1; k++) {
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        vec3 offset = vec3(float(i), float(j), float(k));
        vec3 r = offset + mmaHash33(base + offset) * 0.9 - f;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          cellId = base + offset;
        } else if (d < f2) {
          f2 = d;
        }
      }
    }
  }
  return vec2(sqrt(f1), sqrt(f2));
}
`;

/** Full-screen pass vertex shader: a 2x2 plane straight to clip space. */
export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Nebula: domain-warped noise mapped through the palette. Rendered at low resolution. */
export const NEBULA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uAspect;
uniform vec2 uDrift;
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uGlow;
uniform vec3 uAccent;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.3 + uDrift;
  float t = uTime * 0.018;
  vec2 q = vec2(mmaFbm(vec3(p, t)), mmaFbm(vec3(p + vec2(5.2, 1.3), t)));
  vec2 r = vec2(
    mmaFbm(vec3(p + 3.0 * q + vec2(1.7, 9.2), t * 1.4)),
    mmaFbm(vec3(p + 3.0 * q + vec2(8.3, 2.8), t * 1.4))
  );
  float f = mmaFbm(vec3(p + 2.6 * r, t * 0.8));

  vec2 bandDir = normalize(vec2(1.0, 0.38));
  float across = dot(p - uDrift * 0.6, vec2(-bandDir.y, bandDir.x));
  float band = exp(-across * across * 0.75);

  float body = smoothstep(0.32, 0.88, f);
  float glow = smoothstep(0.58, 1.0, f + length(q - 0.5) * 0.35);
  float filament = smoothstep(0.64, 0.92, r.x) * smoothstep(0.42, 0.8, f);
  float dust = smoothstep(0.52, 0.78, mmaFbmLite(vec3(p * 1.8 + 7.0, t * 0.5)));

  // Large, slow regions shift the glowing gas between the glow and accent hues.
  float hue = smoothstep(0.38, 0.7, mmaNoise3(vec3(p * 0.42 + 3.0, t * 0.6)));
  vec3 gas = mix(uGlow, mix(uGlow, uAccent, 0.75), hue);
  vec3 col = uDeep;
  col = mix(col, uMid, body * (0.6 + 0.4 * band));
  col = mix(col, gas, glow * (0.45 + 0.55 * band));
  col = mix(col, uAccent * 1.15, filament * 0.85);
  col += gas * band * body * 0.22;
  col += uAccent * pow(max(glow * filament, 0.0), 2.0) * 0.5;
  col *= 1.0 - dust * 0.5 * band;
  col = mix(uDeep, col, 0.6 + 0.4 * band);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Composite: upscaled nebula plus focus light, vignette, film grain and dithering. */
export const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D tNebula;
uniform float uTime;
uniform float uAspect;
uniform float uGrain;
uniform float uExposure;
uniform vec2 uFocusPos;
uniform vec3 uFocusColor;
uniform float uFocusStrength;
uniform float uFocusRadius;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec3 col = texture2D(tNebula, vUv).rgb;
  vec2 d = (vUv - uFocusPos) * vec2(uAspect, 1.0);
  float focus = exp(-dot(d, d) / max(0.0001, uFocusRadius * uFocusRadius));
  col += uFocusColor * uFocusStrength * focus * 0.6;
  col += uFocusColor * uFocusStrength * focus * focus * 0.4;
  vec2 v = (vUv - 0.5) * vec2(min(uAspect, 1.7), 1.0);
  col *= mix(1.0, 0.38, smoothstep(0.32, 1.05, length(v) * 1.1));
  col *= uExposure;
  float grain = mmaHash12(gl_FragCoord.xy + fract(uTime * 7.0) * 517.0) - 0.5;
  col += grain * uGrain * (0.35 + col);
  col += (mmaHash12(gl_FragCoord.xy * 1.731 + 11.0) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

/** Stars: instanced quads that stretch into streaks along their motion at warp speed. */
export const STAR_VERTEX = /* glsl */ `
attribute vec3 aStar;
attribute vec4 aLook;
uniform float uTravel;
uniform float uDepth;
uniform float uNear;
uniform float uWarp;
uniform float uStreak;
uniform float uTime;
uniform float uPixelRatio;
uniform float uTwinkle;
uniform float uScroll;
uniform vec2 uViewport;
uniform vec2 uParallax;
uniform vec3 uCool;
uniform vec3 uWarm;
uniform vec3 uTint;
varying vec2 vLocal;
varying vec3 vColor;
varying float vAlpha;
varying float vHead;
varying float vStretch;
void main() {
  float z = mod(aStar.z + uTravel, uDepth) - uDepth + uNear;
  float depthT = clamp((z + uDepth - uNear) / uDepth, 0.0, 1.0);
  vec3 wp = vec3(aStar.xy + uParallax * (0.3 + 0.7 * depthT), z);
  wp.y += uScroll;
  vec4 viewPos = viewMatrix * vec4(wp, 1.0);
  vec4 head = projectionMatrix * viewPos;
  vec4 tail = projectionMatrix * viewMatrix * vec4(wp - vec3(0.0, 0.0, uStreak * uWarp), 1.0);
  vec2 hp = head.xy / head.w * 0.5 * uViewport;
  vec2 tp = tail.xy / tail.w * 0.5 * uViewport;
  vec2 dir = hp - tp;
  float len = length(dir);
  vec2 ax = len > 0.0001 ? dir / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-ax.y, ax.x);
  float dist = max(0.5, -viewPos.z);
  float sizePx = aLook.x * uPixelRatio * clamp(16.0 / dist, 0.55, 3.4);
  float along = position.x + 0.5;
  vec2 px = mix(tp, hp, along) + ax * position.x * sizePx + perp * position.y * sizePx;
  gl_Position = vec4(px / (0.5 * uViewport) * head.w, head.z, head.w);
  vLocal = position.xy * 2.0;
  vHead = along;
  vStretch = len / (len + sizePx);
  float fadeFar = 1.0 - smoothstep(uDepth * 0.72, uDepth * 0.98, dist);
  float fadeNear = smoothstep(0.8, 3.5, dist);
  float twinkle = 1.0 - uTwinkle * 0.4 * (0.5 + 0.5 * sin(uTime * (0.7 + aLook.y * 2.4) + aLook.y * 43.0));
  vec3 base = mix(uCool, uWarm, aLook.z);
  vColor = mix(base, uTint, 0.22) * aLook.w * twinkle;
  vAlpha = fadeFar * fadeNear * (1.0 + uWarp * 0.8);
}
`;

export const STAR_FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying vec3 vColor;
varying float vAlpha;
varying float vHead;
varying float vStretch;
void main() {
  float r2 = dot(vLocal, vLocal);
  float disc = exp(-r2 * 3.2) + exp(-r2 * 22.0) * 0.9;
  float streak = exp(-vLocal.y * vLocal.y * 5.0) * smoothstep(1.0, 0.55, abs(vLocal.x)) * mix(0.18, 1.0, vHead * vHead);
  float a = mix(disc, streak, vStretch);
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;

/** Shared vertex shader for spheres: object position for surface noise, view-space normal for light. */
export const SPHERE_VERTEX = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vObj = position;
  vNormalV = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

/** Planet surface. One of STYLE_BANDED, STYLE_CRYSTAL, STYLE_STORM or STYLE_OCEAN is defined. */
export const PLANET_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uAtmosphere;
uniform vec3 uAmbient;
uniform float uHighlight;
uniform float uSeed;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
${NOISE_GLSL}
void main() {
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  vec3 L = normalize(uLightDir);
  vec3 p = normalize(vObj) + vec3(uSeed);
  vec3 surface = uColorA;
  vec3 emissive = vec3(0.0);
  float specular = 0.0;
  vec3 shadingN = N;

#ifdef STYLE_BANDED
  float lat = vObj.y;
  float turbulence = mmaFbm(p * 2.6 + vec3(0.0, uTime * 0.015, 0.0));
  float bands = sin(lat * 13.0 + turbulence * 5.0) * 0.5 + 0.5;
  float fine = mmaFbmLite(vec3(p.x * 2.0, lat * 24.0 + turbulence * 3.0, p.z * 2.0));
  surface = mix(uColorA, uColorB, smoothstep(0.15, 0.85, bands));
  surface = mix(surface, uColorC, smoothstep(0.55, 0.85, fine) * 0.55);
  float spot = smoothstep(0.3, 0.0, length(vec2((atan(vObj.z, vObj.x) - 0.6) * 0.9, (lat + 0.32) * 3.2)));
  surface = mix(surface, uColorC * 1.15, spot * 0.75);
#endif

#ifdef STYLE_CRYSTAL
  vec3 cellId;
  vec2 cells = mmaCells(p * 3.4, cellId);
  float edge = smoothstep(0.0, 0.07, cells.y - cells.x);
  float parity = mod(floor(mmaHash3(cellId) * 2.0), 2.0);
  vec3 cell = mix(uColorA, uColorB, parity * 0.75 + mmaHash3(cellId + 3.1) * 0.25);
  surface = mix(uColorC * 1.3, cell, edge);
  vec3 tilt = mmaHash33(cellId) - 0.5;
  shadingN = normalize(N + tilt * 0.55);
  specular = 1.0;
  emissive = uColorC * (1.0 - edge) * 0.35;
#endif

#ifdef STYLE_STORM
  float swirl = mmaFbm(p * 2.4 + vec3(uTime * 0.02, 0.0, 0.0));
  float bandsS = sin(vObj.y * 9.0 + swirl * 6.0) * 0.5 + 0.5;
  surface = mix(uColorA, uColorB, smoothstep(0.2, 0.9, bandsS * 0.6 + swirl * 0.6));
  float ridge = 1.0 - abs(mmaFbm(p * 4.2 + swirl * 1.8 + vec3(0.0, 0.0, uTime * 0.04)) * 2.0 - 1.0);
  float veins = pow(ridge, 14.0);
  float strike = step(0.82, mmaHash12(vec2(floor(uTime * 5.0), uSeed * 13.0)));
  float region = smoothstep(0.55, 0.75, mmaNoise3(p * 1.6 + vec3(floor(uTime * 5.0))));
  emissive = uColorC * veins * (0.55 + 2.8 * strike * region);
#endif

#ifdef STYLE_OCEAN
  float land = smoothstep(0.5, 0.56, mmaFbm(p * 1.8));
  float clouds = smoothstep(0.48, 0.82, mmaFbm(p * 3.4 + vec3(uTime * 0.008, 0.0, 0.0)));
  surface = mix(uColorA, uColorB, land);
  surface = mix(surface, uColorC, clouds * 0.85);
  specular = (1.0 - land) * (1.0 - clouds) * 0.8;
#endif

  float ndl = dot(shadingN, L);
  float diffuse = smoothstep(-0.12, 1.0, ndl);
  vec3 col = surface * (uAmbient + diffuse * 1.15);
  float terminator = smoothstep(-0.25, 0.15, dot(N, L)) * (1.0 - smoothstep(0.15, 0.55, dot(N, L)));
  col += uAtmosphere * terminator * 0.28;
  vec3 H = normalize(L + V);
  col += vec3(1.0) * specular * pow(max(dot(shadingN, H), 0.0), 48.0) * 0.55 * step(0.0, ndl);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uAtmosphere * fresnel * (0.2 + 1.1 * smoothstep(-0.3, 0.6, dot(N, L))) * (1.0 + uHighlight * 0.8);
  col += emissive;
  col *= 1.0 + uHighlight * 0.18;
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Atmosphere halo, drawn on the back faces of a slightly larger sphere with additive blending. */
export const HALO_FRAGMENT = /* glsl */ `
uniform vec3 uAtmosphere;
uniform vec3 uLightDir;
uniform float uStrength;
uniform float uEdge;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float inner = clamp(-dot(N, V) / uEdge, 0.0, 1.0);
  float intensity = pow(inner, 2.4);
  float lit = smoothstep(-0.45, 0.55, dot(N, normalize(uLightDir)));
  gl_FragColor = vec4(uAtmosphere * intensity * (0.18 + 1.2 * lit) * uStrength, 1.0);
}
`;

/** A star's photosphere: limb darkening and slowly boiling granulation. */
export const SUN_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uEdge;
uniform float uTime;
uniform float uIntensity;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewPos;
${NOISE_GLSL}
void main() {
  vec3 N = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float limb = pow(mu, 0.42);
  float granules = mmaFbm(normalize(vObj) * 11.0 + vec3(0.0, uTime * 0.11, uTime * 0.05));
  vec3 col = mix(uEdge, uCore, limb) * (0.8 + 0.34 * granules);
  col += uEdge * pow(1.0 - mu, 1.6) * 0.45;
  gl_FragColor = vec4(col * uIntensity, 1.0);
}
`;

/** A star's glow and corona on a camera-facing quad, with soft diffraction spikes. */
export const GLOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
uniform float uSpikes;
uniform float uSeed;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  float angle = atan(c.y, c.x);
  float glow = exp(-d * d * 9.0) * 1.3 + exp(-d * 4.0) * 0.55;
  float rays = mmaFbmLite(vec3(cos(angle) * 2.2 + uSeed, sin(angle) * 2.2, d * 1.6 - uTime * 0.08));
  float corona = smoothstep(0.45, 1.0, rays) * exp(-d * 3.0) * 0.75;
  float spikes = (exp(-abs(c.y) * 160.0) + exp(-abs(c.x) * 160.0)) * exp(-d * 3.4) * uSpikes;
  vec3 col = uColor * (glow + corona) + mix(uColor, vec3(1.0), 0.6) * spikes;
  float fade = 1.0 - smoothstep(0.82, 1.0, d);
  gl_FragColor = vec4(col * uIntensity * fade, 1.0);
}
`;

/** Orbit ribbon around a star: constant pixel width with a comet of light running along it. */
export const ORBIT_VERTEX = /* glsl */ `
attribute vec2 aOrbit;
uniform vec2 uCenter;
uniform vec2 uRadii;
uniform float uHalfWidth;
varying float vAngle;
void main() {
  float c = cos(aOrbit.x);
  float s = sin(aOrbit.x);
  vec2 p = uCenter + vec2(c * uRadii.x, s * uRadii.y);
  vec2 n = normalize(vec2(c * uRadii.y, s * uRadii.x) + vec2(1e-5));
  p += n * aOrbit.y * uHalfWidth;
  vAngle = aOrbit.x;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, -0.05, 1.0);
}
`;

export const ORBIT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSpeed;
uniform float uPhase;
uniform float uOpacity;
varying float vAngle;
void main() {
  float head = fract(vAngle / 6.2831853 - uTime * uSpeed + uPhase);
  float comet = pow(head, 22.0) * 1.6 + pow(head, 4.0) * 0.22;
  // The far half of the orbit (behind the star) fades away, as a ring seen at an angle would.
  float near = 0.04 + 0.96 * smoothstep(0.55, -0.25, sin(vAngle));
  gl_FragColor = vec4(uColor * (0.16 + comet) * near * uOpacity, 1.0);
}
`;

/** Electron-shell rings around a planet (torus), each with a bright electron running along it. */
export const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uSpeed;
uniform float uPhase;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float head = fract(vUv.x - uTime * uSpeed + uPhase);
  float electron = pow(head, 60.0) * 5.0 + pow(head, 10.0) * 0.6;
  gl_FragColor = vec4(uColor * (0.2 + electron) * uOpacity, 1.0);
}
`;
