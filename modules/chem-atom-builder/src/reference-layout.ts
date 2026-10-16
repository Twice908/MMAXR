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
  readonly label?: string;
  readonly orientation?: "horizontal" | "vertical";
  readonly note?: string;
}

export interface ReferenceLayoutElement {
  readonly id: string;
  readonly rect: ReferenceRect | null;
  readonly parentId: string | null;
  readonly role: "surface" | "content" | "label" | "control";
  readonly backingSurfaceId?: string;
  readonly textBounds?: ReferenceRect | null;
  readonly stackId?: string;
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
    brand: { text: "MMAXR", rect: referenceRect(81, 97, 248, 60) },
    moduleTitle: { text: "Atom Builder", rect: referenceRect(1648, 94, 426, 60) },
  },
  panels: {
    model: referenceRect(78, 209, 1412, 841),
    particles: referenceRect(1535, 209, 514, 1055),
    mission: referenceRect(78, 1080, 736, 370),
    hints: referenceRect(849, 1080, 641, 370),
  },
  regions: [
    { id: "modelArea", rect: referenceRect(103, 225, 1110, 650) },
    { id: "captionsOn", rect: referenceRect(1190, 237, 300, 72) },
    { id: "speedChip1x", rect: referenceRect(1029, 324, 153, 72) },
    { id: "narrationOn", rect: referenceRect(1199, 324, 291, 72) },
    { id: "replay", rect: referenceRect(1270, 415, 180, 72) },
    { id: "captionTextArea", rect: referenceRect(203, 892, 1120, 108) },

    { id: "particleTitle", rect: referenceRect(1582, 253, 420, 52) },
    {
      id: "protonRow",
      rect: referenceRect(1565, 326, 467, 91),
    },
    { id: "protonSwatch", rect: referenceRect(1570, 330, 78, 78) },
    { id: "protonLabelAndCount", rect: referenceRect(1665, 343, 165, 68) },
    { id: "protonMinus", rect: referenceRect(1880, 337, 57, 57) },
    { id: "protonPlus", rect: referenceRect(1954, 337, 57, 57) },
    {
      id: "neutronRow",
      rect: referenceRect(1565, 447, 467, 91),
    },
    { id: "neutronSwatch", rect: referenceRect(1570, 451, 78, 78) },
    { id: "neutronLabelAndCount", rect: referenceRect(1665, 464, 165, 68) },
    { id: "neutronMinus", rect: referenceRect(1880, 458, 57, 57) },
    { id: "neutronPlus", rect: referenceRect(1954, 458, 57, 57) },
    {
      id: "electronRow",
      rect: referenceRect(1565, 568, 467, 91),
    },
    { id: "electronSwatch", rect: referenceRect(1570, 572, 78, 78) },
    { id: "electronLabelAndCount", rect: referenceRect(1665, 585, 165, 68) },
    { id: "electronMinus", rect: referenceRect(1880, 579, 57, 57) },
    { id: "electronPlus", rect: referenceRect(1954, 579, 57, 57) },
    { id: "elementBlock", rect: referenceRect(1608, 690, 396, 107) },
    { id: "elementSymbol", rect: referenceRect(1610, 694, 94, 96) },
    { id: "elementName", rect: referenceRect(1768, 694, 224, 43) },
    { id: "elementNumber", rect: referenceRect(1768, 754, 224, 43) },
    { id: "propertyRowAtomicNumber", rect: referenceRect(1598, 814, 411, 59) },
    { id: "propertyRowMassNumber", rect: referenceRect(1598, 890, 411, 59) },
    { id: "propertyRowCharge", rect: referenceRect(1598, 966, 411, 59) },
    { id: "propertyRowElectronicConfiguration", rect: referenceRect(1598, 1042, 411, 82) },
    { id: "propertyRowOuterShell", rect: referenceRect(1598, 1141, 411, 59) },

    { id: "missionLabel", rect: referenceRect(120, 1116, 257, 43) },
    { id: "missionProgressBar", rect: referenceRect(394, 1116, 388, 26) },
    { id: "missionTitle", rect: referenceRect(117, 1176, 620, 102) },
    { id: "missionBody", rect: referenceRect(117, 1295, 620, 86) },
    { id: "missionHintLine", rect: referenceRect(117, 1398, 528, 43) },
    { id: "hintsLabel", label: "Hints", rect: referenceRect(894, 1118, 140, 43) },
    { id: "hintsProgressBar", rect: null, note: "Not visible in the supplied reference." },
    { id: "hintsTitle", rect: null, note: "No title separate from the panel label is visible." },
    { id: "hintsBody", rect: referenceRect(894, 1202, 514, 140) },
    { id: "hintsHintLine", rect: null, note: "No separate hint line is visible." },

    { id: "hintButton", rect: referenceRect(1680, 1286, 170, 74) },
    { id: "checkButton", rect: referenceRect(1875, 1286, 174, 74) },
    { id: "freePlayButton", rect: referenceRect(1680, 1378, 369, 74) },
    { id: "futureLogoSlot", rect: referenceRect(1514, 1292, 138, 142) },
    {
      id: "positionSliderTrack",
      rect: referenceRect(110, 1503, 485, 34),
      orientation: "horizontal",
    },
    {
      id: "positionSliderLabel",
      label: "Position",
      rect: null,
      orientation: "horizontal",
      note: "Label is identified by the task but black-on-black in the PNG; bounds cannot be measured.",
    },
    {
      id: "scaleSliderTrack",
      rect: referenceRect(2125, 1048, 31, 486),
      orientation: "vertical",
    },
    {
      id: "scaleSliderLabel",
      label: "Scale",
      rect: null,
      orientation: "vertical",
      note: "Label is identified by the task but black-on-black in the PNG; bounds cannot be measured.",
    },
    { id: "resetViewButton", rect: referenceRect(1550, 1510, 240, 71) },
    { id: "resetAtomButton", rect: referenceRect(1807, 1510, 240, 71) },
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

const panelElementIds = {
  model: "model-panel",
  particles: "particles-panel",
  mission: "mission-panel",
  hints: "hints-panel",
} as const;

function parentForRegion(id: string): string {
  if (/^(proton|neutron|electron)(Swatch|LabelAndCount|Minus|Plus)$/.test(id)) {
    const particle = /^(proton|neutron|electron)/.exec(id)?.[1];
    return particle ? `${particle}Row` : panelElementIds.particles;
  }
  if (/^(proton|neutron|electron)Row$/.test(id) ||
    /^(particleTitle|elementBlock|propertyRow)/.test(id)) {
    return panelElementIds.particles;
  }
  if (/^element(Symbol|Name|Number)$/.test(id)) return "elementBlock";
  if (/^(missionLabel|missionProgressBar|missionTitle|missionBody|missionHintLine)$/.test(id)) {
    return panelElementIds.mission;
  }
  if (/^hints(Label|Body|Title|ProgressBar|HintLine)$/.test(id)) return panelElementIds.hints;
  if (/^(modelArea|captionsOn|speedChip1x|narrationOn|replay|captionTextArea)$/.test(id)) {
    return panelElementIds.model;
  }
  if (/^(hintButton|checkButton|freePlayButton|futureLogoSlot)$/.test(id)) return "shell";
  return "canvas";
}

function roleForRegion(id: string): ReferenceLayoutElement["role"] {
  if (id === "futureLogoSlot") return "surface";
  if (/Button$|Minus$|Plus$|^captionsOn$|^speedChip1x$|^narrationOn$|^replay$|SliderTrack$|^missionProgressBar$/.test(id)) {
    return "control";
  }
  if (/^(modelArea|captionTextArea|protonRow|neutronRow|electronRow|elementBlock|propertyRow|.*Swatch)$/.test(id)) {
    return "content";
  }
  return "label";
}

function backingForRegion(
  id: string,
  role: ReferenceLayoutElement["role"],
): string | undefined {
  if (role === "control" || role === "surface") return id;
  if (id === "positionSliderLabel" || id === "scaleSliderLabel") {
    return `${id}-plate`;
  }
  if (/^(element(Symbol|Name|Number)|propertyRow|particleTitle|proton|neutron|electron)/.test(id)) {
    return panelElementIds.particles;
  }
  return parentForRegion(id).endsWith("-panel")
    ? parentForRegion(id)
    : "shell";
}

/** Structural slots for every visible reference surface, label, and control. */
export const atomBuilderDesktopLayoutElements: readonly ReferenceLayoutElement[] =
  Object.freeze([
    {
      id: "canvas",
      rect: referenceRect(0, 0, SOURCE_IMAGE.width, SOURCE_IMAGE.height),
      parentId: null,
      role: "content",
    },
    {
      id: "shell",
      rect: atomBuilderDesktopReference.shell,
      parentId: "canvas",
      role: "surface",
    },
    ...Object.entries(atomBuilderDesktopReference.panels).map(([key, rect]) => ({
      id: panelElementIds[key as keyof typeof panelElementIds],
      rect,
      parentId: "shell",
      role: "surface" as const,
    })),
    ...(["brand", "moduleTitle"] as const).flatMap((id) => {
      const header = atomBuilderDesktopReference.header[id];
      const plateId = `${id}-plate`;
      return [
        {
          id: plateId,
          rect: header.rect,
          parentId: "canvas",
          role: "surface" as const,
        },
        {
          id,
          rect: header.rect,
          parentId: plateId,
          role: "label" as const,
          backingSurfaceId: plateId,
          textBounds: header.rect,
        },
      ];
    }),
    ...atomBuilderDesktopReference.regions.map((region) => {
      const role = roleForRegion(region.id);
      const backingSurfaceId = backingForRegion(region.id, role);
      const stackId = /^(modelArea|captionsOn|speedChip1x|narrationOn)$/.test(region.id)
        ? "model-area-control-overlay"
        : undefined;
      return {
        id: region.id,
        rect: region.rect,
        parentId: parentForRegion(region.id),
        role,
        ...(backingSurfaceId ? { backingSurfaceId } : {}),
        ...((role === "label" || role === "control") && region.rect
          ? { textBounds: region.rect }
          : {}),
        ...(stackId ? { stackId } : {}),
      };
    }),
    ...(["positionSliderLabel", "scaleSliderLabel"] as const).map((id) => ({
      id: `${id}-plate`,
      rect: null,
      parentId: "canvas",
      role: "surface" as const,
    })),
  ]);
