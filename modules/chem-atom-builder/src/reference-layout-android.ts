import type {
  ReferenceLayoutElement,
  ReferenceLayoutMeasurement,
  ReferenceRect,
  ReferenceRegion,
} from "./reference-layout.js";

const SOURCE_IMAGE = Object.freeze({ width: 1320, height: 1051 });
const LAYOUT_CANVAS_BOUNDS = Object.freeze({ x: 0, y: -8, width: 1320, height: 1092 });
const SHELL_BOUNDS = Object.freeze({ x: 5, y: -8, width: 1312, height: 1084 });

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

/** Measured Android AR/VR reference; source origin is the PNG's top-left. */
export const atomBuilderAndroidReference = Object.freeze({
  source: {
    asset: "assets/Android AR-VR Layout.png",
    canvasPx: SOURCE_IMAGE,
    layoutCanvasBoundsPx: LAYOUT_CANVAS_BOUNDS,
    coordinateOrigin: "top-left",
    shellBoundsPx: SHELL_BOUNDS,
    shellWidthPx: SHELL_BOUNDS.width,
    measurementNote:
      "The shell follows the visible item union with the existing 24 px outer-padding token; no shell edge is drawn in the PNG.",
  },
  shell: referenceRect(
    SHELL_BOUNDS.x,
    SHELL_BOUNDS.y,
    SHELL_BOUNDS.width,
    SHELL_BOUNDS.height,
  ),
  panels: {
    hints: referenceRect(29, 123, 412, 380),
    model: referenceRect(470, 123, 380, 380),
    particles: referenceRect(876, 123, 417, 852),
    mission: referenceRect(29, 524, 821, 362),
  },
  regions: [
    { id: "futureLogoSlot", rect: referenceRect(45, 16, 83, 82) },
    { id: "resetViewButton", rect: referenceRect(183, 22, 180, 71) },
    { id: "resetAtomButton", rect: referenceRect(394, 22, 180, 71) },
    { id: "captionsOn", rect: referenceRect(594, 22, 180, 71) },
    { id: "replay", rect: referenceRect(795, 22, 180, 71) },
    { id: "speedChip1x", rect: referenceRect(996, 22, 69, 71) },
    { id: "narrationOn", rect: referenceRect(1083, 22, 180, 71) },

    { id: "hintsLabel", label: "Hints", rect: referenceRect(65, 145, 63, 27) },
    { id: "hintsBody", rect: referenceRect(51, 215, 365, 207) },
    { id: "modelArea", rect: referenceRect(486, 139, 348, 348) },

    { id: "particleTitle", rect: referenceRect(918, 160, 333, 36) },
    { id: "protonRow", rect: referenceRect(904, 227, 354, 61) },
    { id: "protonSwatch", rect: referenceRect(905, 228, 49, 49) },
    { id: "protonLabelAndCount", rect: referenceRect(991, 229, 120, 59) },
    { id: "protonMinus", rect: referenceRect(1158, 228, 43, 43) },
    { id: "protonPlus", rect: referenceRect(1214, 228, 43, 43) },
    { id: "neutronRow", rect: referenceRect(904, 328, 354, 61) },
    { id: "neutronSwatch", rect: referenceRect(905, 329, 49, 49) },
    { id: "neutronLabelAndCount", rect: referenceRect(991, 330, 120, 59) },
    { id: "neutronMinus", rect: referenceRect(1158, 336, 43, 43) },
    { id: "neutronPlus", rect: referenceRect(1214, 336, 43, 43) },
    { id: "electronRow", rect: referenceRect(904, 426, 354, 79) },
    { id: "electronSwatch", rect: referenceRect(905, 445, 49, 49) },
    { id: "electronLabelAndCount", rect: referenceRect(991, 426, 120, 59) },
    { id: "electronMinus", rect: referenceRect(1158, 444, 43, 43) },
    { id: "electronPlus", rect: referenceRect(1214, 444, 43, 43) },
    { id: "elementBlock", rect: referenceRect(956, 523, 275, 68) },
    { id: "elementSymbol", rect: referenceRect(958, 527, 70, 61) },
    { id: "elementName", rect: referenceRect(1076, 524, 152, 29) },
    { id: "elementNumber", rect: referenceRect(1076, 564, 152, 27) },
    { id: "propertyRowAtomicNumber", rect: referenceRect(936, 615, 305, 42) },
    { id: "propertyRowMassNumber", rect: referenceRect(936, 669, 305, 42) },
    { id: "propertyRowCharge", rect: referenceRect(936, 723, 305, 42) },
    { id: "propertyRowElectronicConfiguration", rect: referenceRect(936, 777, 305, 64) },
    { id: "propertyRowOuterShell", rect: referenceRect(936, 853, 305, 45) },

    { id: "missionLabel", rect: referenceRect(74, 565, 220, 34) },
    { id: "missionProgressBar", rect: referenceRect(430, 565, 387, 24) },
    { id: "missionTitle", rect: referenceRect(74, 634, 500, 43) },
    { id: "missionBody", rect: referenceRect(74, 710, 715, 66) },
    { id: "missionHintLine", rect: referenceRect(74, 817, 560, 38) },

    { id: "scaleSliderTrack", rect: referenceRect(49, 911, 384, 29), orientation: "horizontal" },
    { id: "scaleSliderLabel", label: "Scale", rect: referenceRect(195, 951, 91, 37), orientation: "horizontal" },
    { id: "positionSliderTrack", rect: referenceRect(449, 911, 384, 29), orientation: "horizontal" },
    { id: "positionSliderLabel", label: "Position", rect: referenceRect(575, 951, 134, 37), orientation: "horizontal" },
    {
      id: "hintButton",
      rect: referenceRect(194, 1004, 110, 48),
      note: "Added by owner; not in the supplied PNG.",
    },
    {
      id: "checkButton",
      rect: referenceRect(320, 1004, 113, 48),
      note: "Added by owner; not in the supplied PNG.",
    },
    {
      id: "freePlayButton",
      rect: referenceRect(449, 1004, 239, 48),
      note: "Added by owner; not in the supplied PNG.",
    },

    { id: "captionTextArea", rect: null, note: "No caption text or backing is shown in the supplied reference." },
  ] satisfies readonly ReferenceRegion[],
  ownerAddedNotInPng: ["hintButton", "checkButton", "freePlayButton"],
  proposedScales: {
    spacingPx: [4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 128, 160],
    radiusPx: [8, 12, 16, 24, 32, 48, 56],
    measuredVsSnapped: {
      outerPadding: { measuredPx: 24, snappedPx: 24 },
      hintsToModelGap: { measuredPx: 29, snappedPx: 32 },
      modelToParticlesGap: { measuredPx: 26, snappedPx: 24 },
      missionToSlidersGap: { measuredPx: 25, snappedPx: 24 },
      shellCornerRadius: { measuredPx: 24, snappedPx: 24 },
      panelCornerRadius: { measuredPx: 20, snappedPx: 24 },
      controlCornerRadius: { measuredPx: 8, snappedPx: 8 },
      buttonCornerRadius: { measuredPx: 35, snappedPx: 32 },
    } satisfies Readonly<Record<string, ReferenceLayoutMeasurement>>,
  },
  missingFromDesktop: [
    "MMAXR brand/header and Atom Builder title/header",
  ],
} as const);

const panelElementIds = {
  hints: "hints-panel",
  model: "model-panel",
  particles: "particles-panel",
  mission: "mission-panel",
} as const;

function parentForRegion(id: string): string {
  if (/^(proton|neutron|electron)(Swatch|LabelAndCount|Minus|Plus)$/.test(id)) {
    return `${/^(proton|neutron|electron)/.exec(id)?.[1]}Row`;
  }
  if (/^(proton|neutron|electron)Row$|^(particleTitle|elementBlock|propertyRow)/.test(id)) {
    return panelElementIds.particles;
  }
  if (/^element(Symbol|Name|Number)$/.test(id)) return "elementBlock";
  if (/^(missionLabel|missionProgressBar|missionTitle|missionBody|missionHintLine)$/.test(id)) {
    return panelElementIds.mission;
  }
  if (/^hints(Label|Body)$/.test(id)) return panelElementIds.hints;
  if (id === "modelArea") return panelElementIds.model;
  if (/^(futureLogoSlot|resetViewButton|resetAtomButton|captionsOn|replay|speedChip1x|narrationOn|scaleSliderTrack|scaleSliderLabel|positionSliderTrack|positionSliderLabel|hintButton|checkButton|freePlayButton)$/.test(id)) {
    return "shell";
  }
  return "canvas";
}

function roleForRegion(id: string): ReferenceLayoutElement["role"] {
  if (id === "futureLogoSlot") return "surface";
  if (/Button$|Minus$|Plus$|^captionsOn$|^speedChip1x$|^narrationOn$|^replay$|SliderTrack$|^missionProgressBar$/.test(id)) {
    return "control";
  }
  if (/^(modelArea|protonRow|neutronRow|electronRow|elementBlock|propertyRow|.*Swatch)$/.test(id)) {
    return "content";
  }
  return "label";
}

function backingForRegion(id: string, role: ReferenceLayoutElement["role"]): string | undefined {
  if (role === "control" || role === "surface") return id;
  if (/^(proton|neutron|electron|particleTitle|element(Symbol|Name|Number)|propertyRow)/.test(id)) {
    return panelElementIds.particles;
  }
  return parentForRegion(id);
}

/** Structural slots for all measured Android surfaces, text, and controls. */
export const atomBuilderAndroidLayoutElements: readonly ReferenceLayoutElement[] =
  Object.freeze([
    {
      id: "canvas",
      rect: referenceRect(
        LAYOUT_CANVAS_BOUNDS.x,
        LAYOUT_CANVAS_BOUNDS.y,
        LAYOUT_CANVAS_BOUNDS.width,
        LAYOUT_CANVAS_BOUNDS.height,
      ),
      parentId: null,
      role: "content",
    },
    {
      id: "shell",
      rect: atomBuilderAndroidReference.shell,
      parentId: "canvas",
      role: "surface",
    },
    ...Object.entries(atomBuilderAndroidReference.panels).map(([key, rect]) => ({
      id: panelElementIds[key as keyof typeof panelElementIds],
      rect,
      parentId: "shell",
      role: "surface" as const,
    })),
    ...atomBuilderAndroidReference.regions.flatMap((region) => {
      if (!region.rect) return [];
      const role = roleForRegion(region.id);
      const backingSurfaceId = backingForRegion(region.id, role);
      return [{
        id: region.id,
        rect: region.rect,
        parentId: parentForRegion(region.id),
        role,
        ...(backingSurfaceId ? { backingSurfaceId } : {}),
        ...((role === "label" || role === "control")
          ? { textBounds: region.rect }
          : {}),
      }];
    }),
  ]);
