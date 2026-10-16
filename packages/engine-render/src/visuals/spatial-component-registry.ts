export interface SpatialComponentRegistryEntry {
  readonly component: string;
  readonly props: readonly string[];
  readonly kitComponent: string;
}

/** Shared spatial primitives, their public configuration, and their kit mappings. */
export const SPATIAL_COMPONENT_REGISTRY: readonly SpatialComponentRegistryEntry[] =
  Object.freeze([
    {
      component: "Text",
      props: ["text", "style", "color", "alignment"],
      kitComponent: "Typography style; text component not specified in kit",
    },
    {
      component: "Button",
      props: [
        "id",
        "label",
        "icon",
        "variant",
        "selected",
        "toggle",
        "disabled",
        "primaryTarget",
        "sizeDp",
        "onClick",
        "onPointerEvent",
      ],
      kitComponent: "Button; pill/control/chip/circle geometry not specified in kit",
    },
    {
      component: "Slider",
      props: [
        "id",
        "label",
        "orientation",
        "min",
        "max",
        "value",
        "trackLengthDp",
        "minimumGroupScale",
        "disabled",
        "onChange",
      ],
      kitComponent: "Slider; orientation and label slot use the shared kit slider",
    },
    {
      component: "SpatialPanelGroup",
      props: ["layout", "scale", "distance", "profile", "cameraLookLimits"],
      kitComponent: "PanelGroup + exactly one shared scale/position Slider pair",
    },
    {
      component: "CameraLookAround",
      props: ["orientation", "screenAngle", "yawLimit", "pitchLimit", "smoothing", "backgroundDrag"],
      kitComponent: "Android Camera only; DeviceOrientation with one-finger empty-background drag fallback",
    },
    {
      component: "Stepper",
      props: ["id", "value", "min", "max", "onChange"],
      kitComponent: "Secondary Button pair; stepper pattern not specified in kit",
    },
    {
      component: "ProgressBar",
      props: ["widthDp", "heightDp", "value", "max"],
      kitComponent: "Progress indicator not specified in kit",
    },
    {
      component: "PropertyRow",
      props: ["label", "value", "widthDp"],
      kitComponent: "Panel content row; property-row component not specified in kit",
    },
  ]);
