/** Tuning and bounds for screen-mode wheel and trackpad zoom. */
export const screenZoomConfig = Object.freeze({
  /** Minimum camera distance from the atom (zoomed in). */
  minDistance: 7,
  /** Maximum camera distance from the atom (zoomed out). */
  maxDistance: 26,
  /** Camera distance restored by Reset view. */
  defaultDistance: 14,
  /** Zoom sensitivity for a plain mouse wheel or two-finger scroll. */
  wheelSensitivity: 0.001,
  /** Zoom sensitivity for Ctrl+wheel trackpad pinch. */
  pinchSensitivity: 0.008,
  /** Set to -1 to reverse the default direction for both zoom gestures. */
  zoomDirection: 1,
  /** Handle plain wheel/two-finger scroll over the canvas. */
  enableWheelZoom: true,
  /** Handle Ctrl+wheel pinch over the canvas. */
  enablePinchZoom: true,
});

/** Tuning, enable flags, and camera bounds used by {@link installZoomControls}. */
export interface ZoomControlsConfig {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly defaultDistance: number;
  readonly wheelSensitivity: number;
  readonly pinchSensitivity: number;
  readonly zoomDirection: 1 | -1;
  readonly enableWheelZoom: boolean;
  readonly enablePinchZoom: boolean;
}

/**
 * Install screen-mode wheel zoom controls and return a listener disposer.
 * When enabled, Ctrl+wheel suppresses browser zoom and model zoom is limited to the canvas bounds.
 * The enable predicate lets immersive XR pass wheel gestures through untouched.
 */
export function installZoomControls(
  canvas: HTMLCanvasElement,
  getDistance: () => number,
  setDistance: (distance: number) => void,
  config: ZoomControlsConfig = screenZoomConfig,
  isEnabled: () => boolean = () => true,
  eventTarget: Pick<Window, "addEventListener" | "removeEventListener"> = window,
): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (!isEnabled()) return;
    if (event.ctrlKey) {
      event.preventDefault();
    }

    const bounds = canvas.getBoundingClientRect();
    const pointerInsideCanvas = event.clientX >= bounds.left
      && event.clientX <= bounds.right
      && event.clientY >= bounds.top
      && event.clientY <= bounds.bottom;

    if (!pointerInsideCanvas) return;
    if (event.ctrlKey ? !config.enablePinchZoom : !config.enableWheelZoom) return;
    if (!event.ctrlKey) event.preventDefault();

    const deltaModeScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? 100
        : 1;
    const sensitivity = event.ctrlKey ? config.pinchSensitivity : config.wheelSensitivity;
    const nextDistance = getDistance() * Math.exp(
      event.deltaY * deltaModeScale * sensitivity * config.zoomDirection,
    );
    setDistance(Math.max(
      config.minDistance,
      Math.min(config.maxDistance, nextDistance),
    ));
  };

  eventTarget.addEventListener("wheel", onWheel, { capture: true, passive: false });
  return () => eventTarget.removeEventListener("wheel", onWheel, true);
}
