export interface HintPoint {
  readonly x: number;
  readonly y: number;
}

export interface HintRect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface HintInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Place a 36px direction hint inside the free viewport band, or hide it on collision. */
export function placeSpatialHint(
  point: HintPoint,
  viewport: Readonly<{ width: number; height: number }>,
  safeArea: HintInsets,
  topControls: readonly HintRect[],
  bottomControls: readonly HintRect[],
  controls: readonly HintRect[],
): HintPoint | null {
  const edge = 18;
  const margin = (inset: number): number => Math.max(36, inset + 8);
  const left = margin(safeArea.left) + edge;
  const right = viewport.width - margin(safeArea.right) - edge;
  const top = Math.max(
    margin(safeArea.top) + edge,
    ...topControls.map((rect) => rect.bottom + edge + 8),
  );
  const bottom = Math.min(
    viewport.height - margin(safeArea.bottom) - edge,
    ...bottomControls.map((rect) => rect.top - edge - 8),
  );
  if (left > right || top > bottom) return null;

  const placed = {
    x: Math.min(right, Math.max(left, point.x * viewport.width)),
    y: Math.min(bottom, Math.max(top, point.y * viewport.height)),
  };
  const collides = controls.some((rect) =>
    placed.x + edge > rect.left
    && placed.x - edge < rect.right
    && placed.y + edge > rect.top
    && placed.y - edge < rect.bottom);
  return collides ? null : placed;
}
