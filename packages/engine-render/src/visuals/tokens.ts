/** Tunable visual values shared by reusable geometry consumers. */
export interface VisualTokens {
  /** Color used for direct light paths. */
  readonly solidBeamColor: number;
  /** Color used for virtual path extensions. */
  readonly virtualBeamColor: number;
  /** Color used for angle arcs. */
  readonly arcColor: number;
  /** Color used for labels. */
  readonly labelColor: number;
  /** Color used for object markers. */
  readonly objectMarkerColor: number;
  /** Color used for eye markers. */
  readonly eyeMarkerColor: number;
  /** Color used for image markers. */
  readonly imageMarkerColor: number;
  /** Width used for solid beams. */
  readonly beamWidth: number;
  /** Length of each virtual-beam dash. */
  readonly virtualDash: number;
  /** Space between virtual-beam dashes. */
  readonly virtualGap: number;
  /** Radius used for angle arcs. */
  readonly arcRadius: number;
  /** Radius used for point markers. */
  readonly markerRadius: number;
  /** Opacity for direct beams. */
  readonly beamOpacity: number;
  /** Opacity for virtual extensions. */
  readonly virtualOpacity: number;
  /** Minimum world-space width used for readable text labels. */
  readonly labelMinWidth: number;
  /** Ratio between label width and height. */
  readonly labelAspectRatio: number;
  /** Separation used to nudge overlapping labels. */
  readonly labelSeparation: number;
  /** Render order used to keep labels above scene geometry. */
  readonly labelRenderOrder: number;
  /** Canvas width for text labels. */
  readonly labelCanvasWidth: number;
  /** Canvas height for text labels. */
  readonly labelCanvasHeight: number;
  /** Canvas padding used for label backgrounds. */
  readonly labelCanvasPadding: number;
  /** Corner radius used for label backgrounds. */
  readonly labelCornerRadius: number;
  /** Font size used for label text. */
  readonly labelFontSize: number;
  /** Opacity of the label background. */
  readonly labelBackgroundOpacity: number;
  /** Label width multiplier relative to a marker radius. */
  readonly labelMarkerWidthScale: number;
  /** Label height multiplier relative to a marker radius. */
  readonly labelMarkerHeightScale: number;
  /** Opaque room background. */
  readonly stageBackgroundColor: number;
  /** Table plate colour. */
  readonly stagePlateColor: number;
  /** Floor colour. */
  readonly stageFloorColor: number;
  /** Grid colour. */
  readonly stageGridColor: number;
  /** Text-card surface colour. */
  readonly textCardColor: number;
  /** Stage plate side length. */
  readonly stagePlateSize: number;
  /** Stage floor side length. */
  readonly stageFloorSize: number;
  /** Grid extent. */
  readonly stageGridSize: number;
  /** Grid spacing. */
  readonly stageGridStep: number;
  /** Major grid interval. */
  readonly stageGridMajorEvery: number;
  /** Height of the table surface above the floor. */
  readonly stageTableHeight: number;
  /** Floor offset below the table surface. */
  readonly stageFloorDepth: number;
  /** Grid offset above the table surface to prevent z-fighting. */
  readonly stageGridLift: number;
  /** Grid opacity in transparent mode. */
  readonly stageTransparentGridOpacity: number;
  /** Grid opacity in opaque mode. */
  readonly stageOpaqueGridOpacity: number;
  /** Width of a text card. */
  readonly textCardWidth: number;
  /** Height of a text card. */
  readonly textCardHeight: number;
  /** Text-card elevation above its mapper-plane position. */
  readonly textCardLift: number;
  /** Text-card canvas width in pixels. */
  readonly textCardCanvasWidth: number;
  /** Text-card canvas height in pixels. */
  readonly textCardCanvasHeight: number;
  /** Text-card font size in canvas pixels. */
  readonly textCardFontSize: number;
  /** Mirror bar width in mapper-plane units. */
  readonly galleryMirrorWidth: number;
  /** Orthographic camera near clipping plane. */
  readonly galleryNear: number;
  /** Orthographic camera far clipping plane. */
  readonly galleryFar: number;
  /** Maximum device pixel ratio used by the gallery renderer. */
  readonly galleryPixelRatioCap: number;
  /** Gallery ambient light intensity. */
  readonly galleryAmbientIntensity: number;
  /** Camera height used for top-down scene framing. */
  readonly galleryCameraHeight: number;
  /** Minimum orthographic frame height. */
  readonly galleryMinFrameSpan: number;
  /** Padding factor applied to fitted scene bounds. */
  readonly galleryFramePadding: number;
  /** Maximum ray trace steps per gallery path. */
  readonly galleryPathLimit: number;
  /** Maximum label repositioning iterations. */
  readonly galleryLabelNudgeLimit: number;
  /** Label repositioning distance per iteration. */
  readonly galleryLabelNudgeStep: number;
  /** Half-length of the single-mirror scene bar. */
  readonly gallerySingleMirrorHalfLength: number;
  /** Object vertical coordinate in the single-mirror scene. */
  readonly gallerySingleObjectHeight: number;
  /** Eye horizontal coordinate in the single-mirror scene. */
  readonly gallerySingleEyeX: number;
  /** Eye vertical coordinate in the single-mirror scene. */
  readonly gallerySingleEyeHeight: number;
  /** Extent of the two-mirror scene segments. */
  readonly galleryTwoMirrorExtent: number;
  /** Object horizontal coordinate in the two-mirror scene. */
  readonly galleryTwoMirrorObjectX: number;
  /** Eye horizontal coordinate in the two-mirror scene. */
  readonly galleryTwoMirrorEyeX: number;
  /** Eye vertical coordinate in the two-mirror scene. */
  readonly galleryTwoMirrorEyeY: number;
  /** Half-length of the apparatus scene mirror bar. */
  readonly galleryApparatusMirrorHalfLength: number;
  /** Object horizontal coordinate in the apparatus scene. */
  readonly galleryApparatusObjectX: number;
  /** Object vertical coordinate in the apparatus scene. */
  readonly galleryApparatusObjectY: number;
  /** Eye horizontal coordinate in the apparatus scene. */
  readonly galleryApparatusEyeX: number;
  /** Eye vertical coordinate in the apparatus scene. */
  readonly galleryApparatusEyeY: number;
  /** Half-length of the stage mirror bar. */
  readonly galleryStageMirrorHalfLength: number;
  /** Distance from the stage mirror used for the object and its image. */
  readonly galleryStageCardOffset: number;
  /** Opening angle used for the two-mirror gallery example. */
  readonly galleryTwoMirrorAngle: number;
  /** Separation used for the two-mirror gallery example. */
  readonly galleryTwoMirrorSeparation: number;
}

export const visualTokens: VisualTokens = {
  solidBeamColor: 0xffffff,
  virtualBeamColor: 0x88ccff,
  arcColor: 0xffcc44,
  labelColor: 0xffffff,
  objectMarkerColor: 0x44cc88,
  eyeMarkerColor: 0x4488ff,
  imageMarkerColor: 0xcc66ff,
  beamWidth: 0.025,
  virtualDash: 0.12,
  virtualGap: 0.08,
  arcRadius: 0.35,
  markerRadius: 0.08,
  beamOpacity: 1,
  virtualOpacity: 0.65,
  labelMinWidth: 0.8,
  labelAspectRatio: 4,
  labelSeparation: 0.9,
  labelRenderOrder: 1000,
  labelCanvasWidth: 512,
  labelCanvasHeight: 128,
  labelCanvasPadding: 8,
  labelCornerRadius: 28,
  labelFontSize: 48,
  labelBackgroundOpacity: 0.35,
  labelMarkerWidthScale: 8,
  labelMarkerHeightScale: 2,
  stageBackgroundColor: 0x17212b,
  stagePlateColor: 0x283744,
  stageFloorColor: 0x111820,
  stageGridColor: 0x93a5b4,
  textCardColor: 0xffffff,
  stagePlateSize: 12,
  stageFloorSize: 24,
  stageGridSize: 10,
  stageGridStep: 1,
  stageGridMajorEvery: 5,
  stageTableHeight: 0.15,
  stageFloorDepth: 0.12,
  stageGridLift: 0.012,
  stageTransparentGridOpacity: 0.12,
  stageOpaqueGridOpacity: 0.55,
  textCardWidth: 1.8,
  textCardHeight: 0.9,
  textCardLift: 0.6,
  textCardCanvasWidth: 512,
  textCardCanvasHeight: 256,
  textCardFontSize: 72,
  galleryMirrorWidth: 0.08,
  galleryNear: 0.1,
  galleryFar: 100,
  galleryPixelRatioCap: 2,
  galleryAmbientIntensity: 1,
  galleryCameraHeight: 30,
  galleryMinFrameSpan: 8,
  galleryFramePadding: 1.25,
  galleryPathLimit: 10,
  galleryLabelNudgeLimit: 12,
  galleryLabelNudgeStep: 0.25,
  gallerySingleMirrorHalfLength: 5,
  gallerySingleObjectHeight: 3,
  gallerySingleEyeX: 4,
  gallerySingleEyeHeight: 3,
  galleryTwoMirrorExtent: 10,
  galleryTwoMirrorObjectX: 4,
  galleryTwoMirrorEyeX: 6,
  galleryTwoMirrorEyeY: 3,
  galleryApparatusMirrorHalfLength: 4,
  galleryApparatusObjectX: -2,
  galleryApparatusObjectY: 2.5,
  galleryApparatusEyeX: 2,
  galleryApparatusEyeY: 3.5,
  galleryStageMirrorHalfLength: 3,
  galleryStageCardOffset: 1.5,
  galleryTwoMirrorAngle: 90,
  galleryTwoMirrorSeparation: 4,
};
