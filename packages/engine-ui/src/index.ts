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
export {
  createDataTable,
  type DataTable,
  type DataTableColumn,
  type DataTableOptions,
} from "./data-table.js";
export {
  GRAPH_BOX,
  buildGraphGeometry,
  createXyGraph,
  graphSummary,
  niceTicks,
  type GraphData,
  type GraphGeometry,
  type GraphMarker,
  type GraphSeries,
  type XyGraph,
  type XyGraphOptions,
} from "./xy-graph.js";
