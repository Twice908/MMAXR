import * as THREE from "three";
import type { Position3, ScreenSceneFrame, SceneRing } from "./atom-view.js";

const TAU = Math.PI * 2;
/** Same thickness as the classic ring, so drop targets are picked exactly as before. */
const PICK_TUBE = 0.035;
const CORE_TUBE = 0.02;
const HALO_TUBE = 0.12;
const MAX_ORBITERS = 8;

const RING_CALM = new THREE.Color(0x6ff3ff);
const RING_PULSE = new THREE.Color(0xc77dff);
const RING_SETTLED = new THREE.Color(0xd2fdff);
const RING_HIGHLIGHT = new THREE.Color(0xffd36b);
const NUCLEUS_GLOW = 0xffb36b;

const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A ring of light: a soft base glow, a fading trail behind every orbiting sphere, a breathing
// pulse when asked, and a flash when it settles. `uv.x` runs once around the torus.
const RING_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAngles[${MAX_ORBITERS}];
uniform float uCount;
uniform float uRot;
uniform float uPulse;
uniform float uFlash;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  float theta = vUv.x * 6.2831853;
  float trail = 0.0;
  for (int i = 0; i < ${MAX_ORBITERS}; i++) {
    if (float(i) >= uCount) break;
    float behind = mod(uAngles[i] + uRot - theta, 6.2831853);
    trail = max(trail, exp(-behind * 2.6) * step(behind, 2.6));
  }
  float light = 0.36 + 1.1 * trail + 0.6 * uPulse + 1.5 * uFlash;
  gl_FragColor = vec4(uColor * light * uOpacity, 1.0);
}
`;

interface RingRuntime {
  readonly shell: number;
  readonly orbit: THREE.Group;
  readonly materials: readonly THREE.ShaderMaterial[];
  readonly speed: number;
  readonly lit: boolean;
}

interface ShellMemory {
  rot: number;
  emphasis: SceneRing["emphasis"];
  flash: number;
}

/**
 * The "luminous" look for {@link AtomView}: glowing nucleons with a warm halo, rings of light,
 * and spheres on a ring that orbit along it with fading trails. A ring marked `pulse` breathes
 * in violet; one that becomes `settled` flashes once and stays calm and bright. View-only:
 * orbit angles are animation and never feed back into state. While free slots are shown, the
 * orbiters glide home so they line up with the layout again.
 */
export class LuminousAtom {
  private readonly glowTexture = makeGlowTexture();
  private readonly pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  private readonly memory = new Map<number, ShellMemory>();
  private readonly disposables: { dispose(): void }[] = [];
  private rings: RingRuntime[] = [];
  private nucleusGlow: THREE.Sprite | null = null;
  private nucleusGlowScale = 1;
  private highlight: string | null = null;
  private slotsVisible = false;
  private built = false;
  private time = 0;
  private last = 0;

  constructor(private readonly reducedMotion: boolean) {}

  /** Build the atom into `parent`. Ring pick meshes carry `userData.interactionTarget`. */
  build(frame: ScreenSceneFrame, parent: THREE.Group, sphereGeometry: THREE.BufferGeometry): void {
    this.clear();
    const ringFor = (position: Position3): SceneRing | null => {
      const distance = Math.hypot(position.x, position.y, position.z);
      if (distance <= frame.nucleusRadius + 0.25 || frame.rings.length === 0) return null;
      let nearest: SceneRing | null = null;
      for (const ring of frame.rings) {
        if (!nearest || Math.abs(ring.radius - distance) < Math.abs(nearest.radius - distance)) nearest = ring;
      }
      return nearest;
    };

    // Spheres: those in the nucleus glow softly; those on a ring join that ring's orbit.
    const orbiters = new Map<number, { color: number; radius: number; positions: Position3[] }[]>();
    let hasNucleons = false;
    for (const batch of frame.spheres) {
      const core: Position3[] = [];
      for (const position of batch.positions) {
        const ring = ringFor(position);
        if (!ring) {
          core.push(position);
          continue;
        }
        const list = orbiters.get(ring.shell) ?? [];
        let entry = list.find((item) => item.color === batch.color && item.radius === batch.radius);
        if (!entry) {
          entry = { color: batch.color, radius: batch.radius, positions: [] };
          list.push(entry);
        }
        entry.positions.push(position);
        orbiters.set(ring.shell, list);
      }
      if (core.length === 0) continue;
      hasNucleons = true;
      const material = new THREE.MeshStandardMaterial({
        color: batch.color,
        emissive: batch.color,
        emissiveIntensity: 0.3,
        roughness: 0.32,
        metalness: 0.08,
      });
      const mesh = instanced(sphereGeometry, material, core, batch.radius);
      mesh.name = `atom-${batch.id}`;
      parent.add(mesh);
      this.disposables.push(material, mesh);
    }

    if (hasNucleons) {
      const material = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: NUCLEUS_GLOW,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        opacity: 0.85,
      });
      const glow = new THREE.Sprite(material);
      ignoreRaycasts(glow);
      this.nucleusGlowScale = Math.max(frame.nucleusRadius, 0.35) * 4.6;
      glow.scale.setScalar(this.nucleusGlowScale);
      glow.renderOrder = 2;
      parent.add(glow);
      this.nucleusGlow = glow;
      this.disposables.push(material);
    }

    frame.rings.forEach((ring, index) => {
      const memory = this.memory.get(ring.shell) ?? { rot: 0, emphasis: undefined, flash: 0 };
      if (this.built && ring.emphasis === "settled" && memory.emphasis !== "settled") memory.flash = 1;
      memory.emphasis = ring.emphasis;
      this.memory.set(ring.shell, memory);

      const pickGeometry = new THREE.TorusGeometry(ring.radius, PICK_TUBE, 8, 72);
      const pick = new THREE.Mesh(pickGeometry, this.pickMaterial);
      pick.name = `atom-shell-${ring.shell}`;
      pick.userData.interactionTarget = `shell:${ring.shell}`;
      parent.add(pick);
      this.disposables.push(pickGeometry);

      const ringOrbiters = orbiters.get(ring.shell) ?? [];
      const angles = ringOrbiters
        .flatMap((entry) => entry.positions)
        .slice(0, MAX_ORBITERS)
        .map((position) => Math.atan2(position.y, position.x));
      const lit = angles.length > 0;
      const materials = [
        { tube: CORE_TUBE, opacity: lit ? 1 : 0.55 },
        { tube: HALO_TUBE, opacity: lit ? 0.26 : 0.14 },
      ].map(({ tube, opacity }) => {
        // Few radial segments: the ring is thin and additive, so 8 sides look round and keep phones light.
        const geometry = new THREE.TorusGeometry(ring.radius, tube, 8, tube === CORE_TUBE ? 160 : 120);
        const material = new THREE.ShaderMaterial({
          uniforms: {
            uColor: { value: RING_CALM.clone() },
            uAngles: { value: Array.from({ length: MAX_ORBITERS }, (_, i) => angles[i] ?? 0) },
            uCount: { value: angles.length },
            uRot: { value: memory.rot },
            uPulse: { value: 0 },
            uFlash: { value: memory.flash },
            uOpacity: { value: opacity },
          },
          vertexShader: RING_VERTEX,
          fragmentShader: RING_FRAGMENT,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1;
        parent.add(mesh);
        this.disposables.push(geometry, material);
        return material;
      });

      const orbit = new THREE.Group();
      orbit.name = `atom-orbit-${ring.shell}`;
      orbit.rotation.z = memory.rot;
      parent.add(orbit);
      for (const entry of ringOrbiters) {
        const bright = new THREE.Color(entry.color).lerp(new THREE.Color(0xffffff), 0.35);
        const material = new THREE.MeshBasicMaterial({ color: bright });
        const mesh = instanced(sphereGeometry, material, entry.positions, entry.radius);
        orbit.add(mesh);
        const glowMaterial = new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: entry.color,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: 0.9,
        });
        for (const position of entry.positions) {
          const glow = new THREE.Sprite(glowMaterial);
          ignoreRaycasts(glow);
          glow.position.set(position.x, position.y, position.z);
          glow.scale.setScalar(entry.radius * 6);
          glow.renderOrder = 3;
          orbit.add(glow);
        }
        this.disposables.push(material, mesh, glowMaterial);
      }

      this.rings.push({ shell: ring.shell, orbit, materials, speed: 0.55 / (1 + index * 0.45), lit });
    });
    this.built = true;
    this.paint();
  }

  /** Advance the animation. Called once per rendered frame (twice in stereo XR is harmless). */
  tick(): void {
    const now = performance.now();
    if (now - this.last < 1) return;
    const dt = this.last === 0 ? 0 : Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    for (const ring of this.rings) {
      const memory = this.memory.get(ring.shell);
      if (!memory) continue;
      if (!this.reducedMotion) {
        if (this.slotsVisible) {
          const home = Math.round(memory.rot / TAU) * TAU;
          memory.rot = home + (memory.rot - home) * Math.exp(-7 * dt);
        } else {
          memory.rot = (memory.rot + ring.speed * dt) % TAU;
        }
      }
      memory.flash = Math.max(0, memory.flash - dt * 0.8);
      ring.orbit.rotation.z = memory.rot;
    }
    if (this.nucleusGlow) {
      const breath = this.reducedMotion ? 1 : 1 + Math.sin(this.time * 1.6) * 0.05;
      this.nucleusGlow.scale.setScalar(this.nucleusGlowScale * breath);
    }
    this.paint();
  }

  /** Light one drop target in gold (`"shell:<n>"`), or none. */
  setHighlight(target: string | null): void {
    this.highlight = target;
    this.paint();
  }

  /** While free slots show, orbiters glide back to their layout positions. */
  setSlotsVisible(visible: boolean): void {
    this.slotsVisible = visible;
  }

  /** Remove everything built by {@link build}; the view's parent group is cleared by the caller. */
  clear(): void {
    for (const item of this.disposables) item.dispose();
    this.disposables.length = 0;
    this.rings = [];
    this.nucleusGlow = null;
  }

  dispose(): void {
    this.clear();
    this.glowTexture.dispose();
    this.pickMaterial.dispose();
  }

  private paint(): void {
    for (const ring of this.rings) {
      const memory = this.memory.get(ring.shell);
      const emphasis = memory?.emphasis;
      const pulse = emphasis === "pulse" ? (this.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(this.time * 2.4)) : 0;
      const color =
        this.highlight === `shell:${ring.shell}`
          ? RING_HIGHLIGHT
          : emphasis === "pulse"
            ? RING_CALM.clone().lerp(RING_PULSE, 0.55 + 0.35 * pulse)
            : emphasis === "settled"
              ? RING_SETTLED
              : RING_CALM;
      for (const material of ring.materials) {
        const uniforms = material.uniforms;
        (uniforms.uColor!.value as THREE.Color).copy(color);
        uniforms.uRot!.value = memory?.rot ?? 0;
        uniforms.uPulse!.value = ring.lit ? pulse : 0;
        uniforms.uFlash!.value = memory?.flash ?? 0;
      }
    }
  }
}

/**
 * Glow sprites are decoration, never targets. Sprites also cannot be raycast without a camera
 * on the raycaster, and IWSDK's XR pointer raycasts the whole scene every frame without one:
 * a raycastable sprite throws there and stops XR rendering. So they opt out of raycasting.
 */
function ignoreRaycasts(object: THREE.Object3D): void {
  object.raycast = () => undefined;
}

function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  positions: readonly Position3[],
  radius: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
  const matrix = new THREE.Matrix4();
  positions.forEach((position, index) => {
    matrix.makeScale(radius, radius, radius);
    matrix.setPosition(position.x, position.y, position.z);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** A soft round glow, made in memory so no image or canvas is needed. */
function makeGlowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const d = Math.min(1, Math.hypot(dx, dy));
      const alpha = Math.exp(-d * d * 6) * 0.9 + Math.exp(-d * 2.4) * 0.25;
      const edge = 1 - Math.max(0, (d - 0.85) / 0.15);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(Math.min(1, alpha) * Math.max(0, edge) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}
