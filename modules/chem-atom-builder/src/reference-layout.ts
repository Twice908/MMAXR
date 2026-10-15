const SOURCE_IMAGE = Object.freeze({
  width: 2237,
  height: 1684,
});

const SHELL_BOUNDS = Object.freeze({
  x: 51,
  y: 177,
  width: 2028,
  height: 1300,
});

export interface ReferenceRect {
  /** Pixel coordinates in the supplied PNG, with its top-left as origin. */
  readonly sourcePx: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** x, y, width, and height divided by shell width; origin is shell top-left. */
  readonly normalizedToShellWidth: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

/** A named item or content zone measured in the supplied reference image. */
export interface ReferenceRegion {
  readonly id: string;
  readonly rect: ReferenceRect | null;
  readonly note?: string;
}

/** A source measurement and its nearest value on the proposed token scale. */
export interface ReferenceLayoutMeasurement {
  readonly measuredPx: number;
  readonly snappedPx: number;
}

function referenceRect(x: number, y: number, width: number, height: number): ReferenceRect {
  return {
    sourcePx: { x, y, width, height },
    normalizedToShellWidth: {
      x: (x - SHELL_BOUNDS.x) / SHELL_BOUNDS.width,
      y: (y - SHELL_BOUNDS.y) / SHELL_BOUNDS.width,
      width: width / SHELL_BOUNDS.width,
      height: height / SHELL_BOUNDS.width,
    },
  };
}

const absent = (id: string, note: string): ReferenceRegion => ({
  id,
  rect: null,
  note,
});

/** Pixel-measured Atom Builder desktop/headset composition; this is data, not a renderer. */
export const atomBuilderDesktopReference = Object.freeze({
  source: {
    asset: "assets/Atom Buiulder UI with External Sliders.png",
    canvasPx: SOURCE_IMAGE,
    coordinateOrigin: "top-left",
    shellWidthPx: SHELL_BOUNDS.width,
    measurementNote:
      "Visible bounds are rounded to source pixels; unbounded content zones are estimated from placement, not Figma frames.",
  },
  shell: referenceRect(
    SHELL_BOUNDS.x,
    SHELL_BOUNDS.y,
    SHELL_BOUNDS.width,
    SHELL_BOUNDS.height,
  ),
  header: {
    brand: referenceRect(81, 97, 248, 53),
    moduleTitle: referenceRect(1648, 94, 426, 53),
  },
  panels: {
    model: referenceRect(78, 209, 1412, 841),
    particles: referenceRect(1535, 209, 514, 1055),
    mission: referenceRect(78, 1080, 736, 370),
    hints: referenceRect(849, 1080, 641, 370),
  },
  regions: [
    { id: "modelArea", rect: referenceRect(103, 225, 1110, 650) },
    { id: "captionsOn", rect: referenceRect(1270, 237, 180, 72) },
    { id: "speedChip", rect: referenceRect(1170, 324, 72, 72) },
    { id: "narrationOn", rect: referenceRect(1270, 324, 180, 72) },
    { id: "replay", rect: referenceRect(1270, 412, 180, 72) },
    { id: "captionTextArea", rect: referenceRect(203, 889, 1120, 108) },

    { id: "particleTitle", rect: referenceRect(1582, 253, 420, 48) },
    {
      id: "protonRow",
      rect: referenceRect(1565, 326, 467, 91),
    },
    { id: "protonSwatch", rect: referenceRect(1570, 330, 78, 78) },
    { id: "protonLabelAndCount", rect: referenceRect(1687, 343, 165, 68) },
    { id: "protonMinus", rect: referenceRect(1880, 337, 57, 57) },
    { id: "protonPlus", rect: referenceRect(1950, 337, 57, 57) },
    {
      id: "neutronRow",
      rect: referenceRect(1565, 447, 467, 91),
    },
    { id: "neutronSwatch", rect: referenceRect(1570, 451, 78, 78) },
    { id: "neutronLabelAndCount", rect: referenceRect(1687, 464, 165, 68) },
    { id: "neutronMinus", rect: referenceRect(1880, 458, 57, 57) },
    { id: "neutronPlus", rect: referenceRect(1950, 458, 57, 57) },
    {
      id: "electronRow",
      rect: referenceRect(1565, 568, 467, 91),
    },
    { id: "electronSwatch", rect: referenceRect(1570, 572, 78, 78) },
    { id: "electronLabelAndCount", rect: referenceRect(1687, 585, 165, 68) },
    { id: "electronMinus", rect: referenceRect(1880, 579, 57, 57) },
    { id: "electronPlus", rect: referenceRect(1950, 579, 57, 57) },
    { id: "elementBlock", rect: referenceRect(1608, 701, 396, 82) },
    { id: "propertyRowAtomicNumber", rect: referenceRect(1598, 807, 411, 59) },
    { id: "propertyRowMassNumber", rect: referenceRect(1598, 873, 411, 59) },
    { id: "propertyRowCharge", rect: referenceRect(1598, 938, 411, 59) },
    { id: "propertyRowElectronicConfiguration", rect: referenceRect(1598, 1002, 411, 75) },
    { id: "propertyRowOuterShell", rect: referenceRect(1598, 1079, 411, 59) },

    { id: "missionLabel", rect: referenceRect(120, 1118, 157, 22) },
    { id: "missionProgressBar", rect: referenceRect(394, 1116, 388, 26) },
    { id: "missionTitle", rect: referenceRect(117, 1186, 278, 31) },
    { id: "missionBody", rect: referenceRect(117, 1261, 580, 72) },
    { id: "missionHintLine", rect: referenceRect(117, 1368, 528, 37) },
    { id: "hintsLabel", rect: referenceRect(894, 1118, 69, 23) },
    { id: "hintsProgressBar", rect: null, note: "Not visible in the supplied reference." },
    { id: "hintsTitle", rect: null, note: "No title separate from the panel label is visible." },
    { id: "hintsBody", rect: referenceRect(894, 1202, 514, 140) },
    { id: "hintsHintLine", rect: null, note: "No separate hint line is visible." },

    { id: "hintButton", rect: referenceRect(1680, 1286, 170, 74) },
    { id: "checkButton", rect: referenceRect(1875, 1286, 174, 74) },
    { id: "freePlayButton", rect: referenceRect(1680, 1378, 369, 74) },
    { id: "futureLogoSlot", rect: referenceRect(1514, 1292, 138, 142) },
    { id: "positionSliderTrack", rect: referenceRect(110, 1503, 485, 34) },
    absent("positionSliderLabel", "No label is visible in the supplied reference."),
    { id: "scaleSliderTrack", rect: referenceRect(2125, 1048, 31, 486) },
    absent("scaleSliderLabel", "No label is visible in the supplied reference."),
    { id: "resetViewButton", rect: referenceRect(1683, 1510, 181, 71) },
    { id: "resetAtomButton", rect: referenceRect(1873, 1510, 181, 71) },
  ] satisfies readonly ReferenceRegion[],
  proposedScales: {
    spacingPx: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128, 160],
    radiusPx: [8, 12, 16, 24, 32, 48, 56],
    measuredVsSnapped: {
      outerPaddingLeft: { measuredPx: 27, snappedPx: 24 },
      outerPaddingTop: { measuredPx: 32, snappedPx: 32 },
      outerPaddingRight: { measuredPx: 29, snappedPx: 32 },
      outerPaddingBottom: { measuredPx: 27, snappedPx: 24 },
      modelToParticlesGap: { measuredPx: 45, snappedPx: 48 },
      modelToMissionGap: { measuredPx: 30, snappedPx: 32 },
      missionToHintsGap: { measuredPx: 35, snappedPx: 32 },
      particleContentInset: { measuredPx: 52, snappedPx: 48 },
      missionContentInset: { measuredPx: 39, snappedPx: 40 },
      hintsContentInset: { measuredPx: 45, snappedPx: 48 },
      shellCornerRadius: { measuredPx: 54, snappedPx: 56 },
      panelCornerRadius: { measuredPx: 20, snappedPx: 24 },
      actionPillCornerRadius: { measuredPx: 36, snappedPx: 32 },
      smallControlCornerRadius: { measuredPx: 8, snappedPx: 8 },
    } satisfies Readonly<Record<string, ReferenceLayoutMeasurement>>,
  },
} as const);
