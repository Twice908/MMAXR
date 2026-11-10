export { commandButton, el, setText } from "./dom.js";
export { createLessonPanel, type LessonPanel } from "./lesson-panel.js";
export {
  arHudStatusText,
  createArHud,
  nextArHudTab,
  type ArHud,
  type XrHudOptions,
  type XrHudTab,
} from "./xr-hud.js";
export {
  arFailureMessage,
  buildXrDiagnosticsText,
  isTouchFirstDevice,
  isXrDiagnosticsEnabled,
  mountArControls,
  scheduleComfortBreakReminder,
  type ArControlsOptions,
  type ArControlsRenderer,
  type XrDiagnosticsData,
  type XrSceneDiagnostics,
} from "./xr-session.js";
export {
  createNarrationBar,
  narrationButtonLabels,
  narrationStatusText,
  type NarrationBar,
  type NarrationBarHandlers,
} from "./narration-bar.js";
