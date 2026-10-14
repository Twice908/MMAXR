import type { InputAction } from "@mma/engine-render";

export interface SpatialDragRay {
  readonly origin: Readonly<{ x: number; y: number; z: number }>;
  readonly direction: Readonly<{ x: number; y: number; z: number }>;
}

export interface SpatialParticleDragCallbacks {
  readonly begin: (particle: string) => void;
  readonly move: (ray: SpatialDragRay) => string | null;
  readonly runCommand: (command: string) => void;
  readonly end: () => void;
}

/** Route spatial particle gestures through existing input actions and add commands. */
export function createSpatialParticleDragHandler(
  callbacks: SpatialParticleDragCallbacks,
): Readonly<{
  handle(action: InputAction): boolean;
  isActive(): boolean;
}> {
  let activeParticle: string | null = null;
  const handle = (action: InputAction): boolean => {
    const payload = recordPayload(action.payload);
    if (payload.spatialParticleDrag !== true) return false;
    const particle = particleFromSource(payload.source);
    if (action.type === "grab" && particle) {
      if (activeParticle) callbacks.end();
      activeParticle = particle;
      callbacks.begin(particle);
      return true;
    }
    if (!activeParticle || particle !== activeParticle) return true;
    if (action.type === "move") {
      const ray = readRay(payload);
      if (ray) callbacks.move(ray);
      return true;
    }
    if (action.type === "release") {
      try {
        const ray = readRay(payload);
        if (payload.cancelled !== true && ray && callbacks.move(ray) === "nucleus") {
          callbacks.runCommand(`particle:add:${activeParticle}`);
        }
      } finally {
        activeParticle = null;
        callbacks.end();
      }
      return true;
    }
    return true;
  };
  return {
    handle,
    isActive: () => activeParticle !== null,
  };
}

/** Prevent view gestures from moving the atom during a particle drag. */
export function blocksViewInputDuringParticleDrag(
  type: InputAction["type"],
  dragActive: boolean,
): boolean {
  return dragActive && (type === "move" || type === "rotate" || type === "scale");
}

function particleFromSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^tray:(proton|neutron|electron)$/.exec(value);
  return match?.[1] ?? null;
}

function recordPayload(value: InputAction["payload"]): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function readRay(payload: Record<string, unknown>): SpatialDragRay | null {
  const originX = finiteNumber(payload.rayOriginX);
  const originY = finiteNumber(payload.rayOriginY);
  const originZ = finiteNumber(payload.rayOriginZ);
  const directionX = finiteNumber(payload.rayDirectionX);
  const directionY = finiteNumber(payload.rayDirectionY);
  const directionZ = finiteNumber(payload.rayDirectionZ);
  if (
    originX === null ||
    originY === null ||
    originZ === null ||
    directionX === null ||
    directionY === null ||
    directionZ === null
  ) {
    return null;
  }
  return {
    origin: { x: originX, y: originY, z: originZ },
    direction: { x: directionX, y: directionY, z: directionZ },
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
