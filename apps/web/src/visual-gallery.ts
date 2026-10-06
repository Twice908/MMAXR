import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Box3,
  Color,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Object3D,
  Scene,
  Sprite,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  AngleArc,
  BeamLine,
  createPlaneMapper,
  LabStage,
  PointMarker,
  TextCard,
  visualTokens,
} from "@mma/engine-render";
import {
  computeImages,
  imageOfPoint,
  PlaneMirror,
  tracePlanePath,
  traceTwoMirrorPath,
  type Vec2,
} from "@mma/kit-physics-optics";
import "./visual-gallery.css";

interface GalleryScene {
  readonly id: string;
  readonly title: string;
  readonly group: Group;
  readonly labels: readonly LabelPlacement[];
  readonly stage?: LabStage;
}

interface LabelPlacement {
  readonly sprite: Sprite;
  readonly direction: readonly [number, number];
}

/** Mount the development-only reusable visual gallery. */
export function mountVisualGallery(root: HTMLElement): () => void {
  root.innerHTML = `
    <main class="visual-gallery">
      <header class="visual-gallery-header">
        <h1>Visual gallery</h1>
        <p>Drag to orbit; scroll or pinch to zoom.</p>
        <nav class="visual-gallery-scenes" aria-label="Scenes"></nav>
        <button class="visual-gallery-labels" type="button" aria-pressed="true">Labels: On</button>
        <button class="visual-gallery-stage-mode" type="button" hidden>Use transparent stage</button>
      </header>
      <canvas aria-label="Top-down visual gallery" data-testid="visual-gallery-canvas"></canvas>
    </main>
  `;
  const canvas = root.querySelector<HTMLCanvasElement>("canvas");
  const selector = root.querySelector<HTMLElement>(".visual-gallery-scenes");
  const labelsButton = root.querySelector<HTMLButtonElement>(".visual-gallery-labels");
  const stageModeButton = root.querySelector<HTMLButtonElement>(".visual-gallery-stage-mode");
  if (!canvas || !selector || !labelsButton || !stageModeButton) {
    throw new Error("Visual gallery controls could not be initialized.");
  }

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, visualTokens.galleryNear, visualTokens.galleryFar);
  camera.up.set(0, 0, -1);
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, visualTokens.galleryPixelRatioCap));
  scene.add(new AmbientLight(visualTokens.labelColor, visualTokens.galleryAmbientIntensity));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  const mapper = createPlaneMapper({ scale: 1, origin: [0, 0, 0] });
  const scenes = [
    createSingleMirrorScene(mapper),
    createTwoMirrorScene(mapper),
    createApparatusScene(mapper),
    createStageScene(mapper),
  ];
  const sceneButtons = scenes.map((galleryScene, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${String.fromCharCode(97 + index)} ${galleryScene.title}`;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => selectScene(galleryScene));
    selector.append(button);
    return button;
  });
  let activeScene: GalleryScene | null = null;
  let labelsVisible = true;
  let transparentStage = false;

  const applyLabels = (galleryScene: GalleryScene): void => {
    for (const { sprite } of galleryScene.labels) {
      sprite.visible = labelsVisible;
    }
  };
  const fitCamera = (galleryScene: GalleryScene): void => {
    const bounds = new Box3().setFromObject(galleryScene.group);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const { width, height } = canvas.getBoundingClientRect();
    const aspect = width > 0 && height > 0 ? width / height : 1;
    const frameHeight = Math.max(
      size.z,
      size.x / aspect,
      visualTokens.galleryMinFrameSpan,
    ) * visualTokens.galleryFramePadding;
    camera.left = -(frameHeight * aspect) / 2;
    camera.right = (frameHeight * aspect) / 2;
    camera.top = frameHeight / 2;
    camera.bottom = -frameHeight / 2;
    camera.position.set(center.x, center.y + visualTokens.galleryCameraHeight, center.z);
    camera.lookAt(center.x, center.y, center.z);
    camera.updateProjectionMatrix();
    controls.target.set(center.x, center.y, center.z);
    controls.update();
  };
  const selectScene = (galleryScene: GalleryScene): void => {
    for (const item of scenes) {
      item.group.visible = item === galleryScene;
    }
    activeScene = galleryScene;
    sceneButtons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(scenes[index] === galleryScene));
    });
    stageModeButton.hidden = !galleryScene.stage;
    if (galleryScene.stage) {
      galleryScene.stage.setMode(transparentStage ? "transparent" : "opaque");
    } else {
      scene.background = new Color(visualTokens.stageBackgroundColor);
    }
    applyLabels(galleryScene);
    fitCamera(galleryScene);
  };
  scenes.forEach(({ group }) => {
    group.visible = false;
    scene.add(group);
  });
  selectScene(scenes[0]!);

  const onLabelsClick = (): void => {
    labelsVisible = !labelsVisible;
    labelsButton.setAttribute("aria-pressed", String(labelsVisible));
    labelsButton.textContent = `Labels: ${labelsVisible ? "On" : "Off"}`;
    if (activeScene) {
      applyLabels(activeScene);
    }
  };
  const onStageModeClick = (): void => {
    transparentStage = !transparentStage;
    const stage = activeScene?.stage;
    if (!stage) {
      return;
    }
    stage.setMode(transparentStage ? "transparent" : "opaque");
    stageModeButton.textContent = transparentStage ? "Use opaque stage" : "Use transparent stage";
  };
  labelsButton.addEventListener("click", onLabelsClick);
  stageModeButton.addEventListener("click", onStageModeClick);

  const resizeObserver = new ResizeObserver(() => {
    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) {
      return;
    }
    renderer.setSize(width, height, false);
    if (activeScene) {
      fitCamera(activeScene);
    }
  });
  resizeObserver.observe(canvas);
  let frame = 0;
  const render = (): void => {
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(render);
  };
  render();

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    controls.dispose();
    labelsButton.removeEventListener("click", onLabelsClick);
    stageModeButton.removeEventListener("click", onStageModeClick);
    for (const button of sceneButtons) {
      button.remove();
    }
    for (const galleryScene of scenes) {
      disposeGalleryScene(galleryScene);
    }
    renderer.dispose();
    renderer.forceContextLoss();
    root.replaceChildren();
  };
}

function createSingleMirrorScene(mapper: ReturnType<typeof createPlaneMapper>): GalleryScene {
  const group = new Group();
  const labels: LabelPlacement[] = [];
  const mirror = new PlaneMirror(
    { x: -visualTokens.gallerySingleMirrorHalfLength, y: 0 },
    { x: visualTokens.gallerySingleMirrorHalfLength, y: 0 },
  );
  const object = { x: 0, y: visualTokens.gallerySingleObjectHeight };
  const eye = { x: visualTokens.gallerySingleEyeX, y: visualTokens.gallerySingleEyeHeight };
  addMirror(group, mirror, mapper);
  const path = tracePlanePath(object, mirror, eye);
  if (path.status === "ok") {
    addPath(group, path.realPoints, path.virtualSegments, path.hits, [mirror], mapper, labels);
    addMarker(group, "object", object, "Object", mapper, labels);
    addMarker(group, "eye", eye, "Eye", mapper, labels);
    addMarker(group, "image", imageOfPoint(object, mirror).point, "Image", mapper, labels);
  }
  nudgeOverlappingLabels(labels);
  return { id: "single-mirror", title: "Single mirror", group, labels };
}

function createTwoMirrorScene(mapper: ReturnType<typeof createPlaneMapper>): GalleryScene {
  const group = new Group();
  const labels: LabelPlacement[] = [];
  const setup = {
    theta: visualTokens.galleryTwoMirrorAngle,
    d: visualTokens.galleryTwoMirrorSeparation,
  };
  const extent = visualTokens.galleryTwoMirrorExtent;
  const mirrors = [
    new PlaneMirror({ x: 0, y: 0 }, { x: extent, y: extent }),
    new PlaneMirror({ x: 0, y: 0 }, { x: extent, y: -extent }),
  ];
  mirrors.forEach((mirror) => addMirror(group, mirror, mapper));
  const object = { x: visualTokens.galleryTwoMirrorObjectX, y: 0 };
  const eye = { x: visualTokens.galleryTwoMirrorEyeX, y: visualTokens.galleryTwoMirrorEyeY };
  addMarker(group, "object", object, "Object", mapper, labels);
  addMarker(group, "eye", eye, "Eye", mapper, labels);
  const imageSet = computeImages(setup);
  if (imageSet.status === "ok") {
    imageSet.images.forEach((image, index) => {
      const path = traceTwoMirrorPath(setup, image, eye, visualTokens.galleryPathLimit);
      addMarker(group, "image", image.position, `Image ${index + 1}`, mapper, labels);
      if (path.status === "ok") {
        addPath(group, path.realPoints, path.virtualSegments, path.hits, mirrors, mapper, labels);
      }
    });
  }
  nudgeOverlappingLabels(labels);
  return { id: "two-mirrors", title: "Two mirrors", group, labels };
}

function createApparatusScene(mapper: ReturnType<typeof createPlaneMapper>): GalleryScene {
  const group = new Group();
  const labels: LabelPlacement[] = [];
  const mirror = new PlaneMirror(
    { x: -visualTokens.galleryApparatusMirrorHalfLength, y: 0 },
    { x: visualTokens.galleryApparatusMirrorHalfLength, y: 0 },
  );
  const object = {
    x: visualTokens.galleryApparatusObjectX,
    y: visualTokens.galleryApparatusObjectY,
  };
  const eye = {
    x: visualTokens.galleryApparatusEyeX,
    y: visualTokens.galleryApparatusEyeY,
  };
  addMirror(group, mirror, mapper);
  const path = tracePlanePath(object, mirror, eye);
  if (path.status === "ok") {
    addPath(group, path.realPoints, path.virtualSegments, path.hits, [mirror], mapper, labels);
    addMarker(group, "object", object, "Source", mapper, labels);
    addMarker(group, "eye", eye, "Sensor", mapper, labels);
    addMarker(group, "image", imageOfPoint(object, mirror).point, "Image", mapper, labels);
  }
  nudgeOverlappingLabels(labels);
  return { id: "apparatus", title: "Apparatus", group, labels };
}

function createStageScene(mapper: ReturnType<typeof createPlaneMapper>): GalleryScene {
  const group = new Group();
  const labels: LabelPlacement[] = [];
  const stage = new LabStage({ mapper });
  group.add(stage.group);
  const stageMirrorHalfLength = visualTokens.galleryStageMirrorHalfLength;
  const mirror = new PlaneMirror(
    { x: -stageMirrorHalfLength, y: 0 },
    { x: stageMirrorHalfLength, y: 0 },
  );
  addMirror(
    group,
    mirror,
    mapper,
    visualTokens.stageTableHeight + visualTokens.stageGridLift,
  );
  const objectCard = new TextCard({ mapper });
  objectCard.setText("Object");
  objectCard.setPose([0, -visualTokens.galleryStageCardOffset], 0);
  const imageCard = new TextCard({ mapper });
  imageCard.setText("Object");
  imageCard.setMirrored(true);
  imageCard.setPose([0, visualTokens.galleryStageCardOffset], 180);
  group.add(objectCard.mesh, imageCard.mesh);
  nudgeOverlappingLabels(labels);
  return { id: "stage", title: "Stage", group, labels, stage };
}

function addPath(
  group: Group,
  points: readonly Vec2[],
  virtualSegments: readonly { readonly from: Vec2; readonly to: Vec2 }[],
  hits: readonly {
    readonly point: Vec2;
    readonly angleOfIncidence: number;
    readonly angleOfReflection: number;
  }[],
  mirrors: readonly PlaneMirror[],
  mapper: ReturnType<typeof createPlaneMapper>,
  labels: LabelPlacement[],
): void {
  addBeam(group, points, "solid", mapper);
  virtualSegments.forEach(({ from, to }) => addBeam(group, [from, to], "dotted", mapper));
  hits.forEach((hit, index) => {
    const previous = points[index] as Vec2;
    const next = points[index + 2] as Vec2;
    const dirA: readonly [number, number] = [previous.x - hit.point.x, previous.y - hit.point.y];
    const dirB: readonly [number, number] = [next.x - hit.point.x, next.y - hit.point.y];
    const normal = mirrorNormalAt(hit.point, mirrors, dirA);
    addAngle(group, hit.point, dirA, normal, hit.angleOfIncidence, mapper, labels);
    addAngle(group, hit.point, normal, dirB, hit.angleOfReflection, mapper, labels);
  });
}

function addAngle(
  group: Group,
  vertex: Vec2,
  dirA: readonly [number, number],
  dirB: readonly [number, number],
  measuredDegrees: number,
  mapper: ReturnType<typeof createPlaneMapper>,
  labels: LabelPlacement[],
): void {
  const angle = new AngleArc({ mapper });
  angle.set([vertex.x, vertex.y], dirA, dirB, measuredDegrees);
  group.add(angle.beam.mesh);
  labels.push({ sprite: angle.label.sprite, direction: angleMidDirection(dirA, dirB) });
}

function mirrorNormalAt(
  point: Vec2,
  mirrors: readonly PlaneMirror[],
  towards: readonly [number, number],
): readonly [number, number] {
  let closest: PlaneMirror | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const mirror of mirrors) {
    const dx = mirror.end.x - mirror.start.x;
    const dy = mirror.end.y - mirror.start.y;
    const lengthSquared = dx * dx + dy * dy;
    const projection = Math.max(0, Math.min(1,
      ((point.x - mirror.start.x) * dx + (point.y - mirror.start.y) * dy) / lengthSquared));
    const distance = Math.hypot(
      point.x - (mirror.start.x + projection * dx),
      point.y - (mirror.start.y + projection * dy),
    );
    if (distance < closestDistance) {
      closest = mirror;
      closestDistance = distance;
    }
  }
  if (!closest) {
    throw new Error("A reflection hit requires a mirror.");
  }
  const dx = closest.end.x - closest.start.x;
  const dy = closest.end.y - closest.start.y;
  let nx = -dy / Math.hypot(dx, dy);
  let ny = dx / Math.hypot(dx, dy);
  if (nx * towards[0] + ny * towards[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx, ny];
}

function angleMidDirection(
  dirA: readonly [number, number],
  dirB: readonly [number, number],
): readonly [number, number] {
  const normalize = (direction: readonly [number, number]): readonly [number, number] => {
    const length = Math.hypot(direction[0], direction[1]);
    return [direction[0] / length, direction[1] / length];
  };
  const first = normalize(dirA);
  const second = normalize(dirB);
  const sum: readonly [number, number] = [first[0] + second[0], first[1] + second[1]];
  return normalize(sum);
}

function addMirror(
  group: Group,
  mirror: PlaneMirror,
  mapper: ReturnType<typeof createPlaneMapper>,
  elevation = 0,
): void {
  const dx = mirror.end.x - mirror.start.x;
  const dy = mirror.end.y - mirror.start.y;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * visualTokens.galleryMirrorWidth / 2;
  const ny = (dx / length) * visualTokens.galleryMirrorWidth / 2;
  const vertices = [
    ...mapper.toScene(mirror.start.x + nx, mirror.start.y + ny),
    ...mapper.toScene(mirror.start.x - nx, mirror.start.y - ny),
    ...mapper.toScene(mirror.end.x + nx, mirror.end.y + ny),
    ...mapper.toScene(mirror.end.x - nx, mirror.end.y - ny),
  ];
  for (let index = 1; index < vertices.length; index += 3) {
    vertices[index] = (vertices[index] ?? 0) + elevation;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.computeVertexNormals();
  group.add(new Mesh(geometry, new MeshBasicMaterial({ color: visualTokens.solidBeamColor })));
}

function addBeam(
  group: Group,
  points: readonly Vec2[],
  kind: "solid" | "dotted",
  mapper: ReturnType<typeof createPlaneMapper>,
): void {
  const beam = new BeamLine({ mapper });
  beam.setPoints(points.map(({ x, y }) => [x, y]), kind);
  group.add(beam.mesh);
}

function addMarker(
  group: Group,
  kind: "object" | "eye" | "image",
  point: Vec2,
  label: string,
  mapper: ReturnType<typeof createPlaneMapper>,
  labels: LabelPlacement[],
): void {
  const marker = new PointMarker({ kind, mapper, createCanvas: makeCanvas });
  marker.setPosition(point.x, point.y);
  marker.setLabel(label);
  group.add(marker.mesh);
  const sprite = findSprite(marker.mesh);
  if (sprite) {
    const length = Math.hypot(point.x, point.y) || 1;
    labels.push({ sprite, direction: [point.x / length, point.y / length] });
  }
}

function findSprite(root: Object3D): Sprite | null {
  let label: Sprite | null = null;
  root.traverse((object) => {
    if (object instanceof Sprite) {
      label = object;
    }
  });
  return label;
}

function nudgeOverlappingLabels(labels: readonly LabelPlacement[]): void {
  for (let index = 0; index < labels.length; index += 1) {
    const current = labels[index]!;
    let attempts = 0;
    while (attempts < visualTokens.galleryLabelNudgeLimit) {
      const overlaps = labels.slice(0, index).some(({ sprite }) => {
        const dx = current.sprite.position.x - sprite.position.x;
        const dz = current.sprite.position.z - sprite.position.z;
        return Math.hypot(dx, dz) < visualTokens.labelSeparation;
      });
      if (!overlaps) {
        break;
      }
      current.sprite.position.x += current.direction[0] * visualTokens.galleryLabelNudgeStep;
      current.sprite.position.z += current.direction[1] * visualTokens.galleryLabelNudgeStep;
      attempts += 1;
    }
  }
}

function disposeGalleryScene(galleryScene: GalleryScene): void {
  galleryScene.stage?.dispose();
  const stageObjects = new Set<Object3D>();
  galleryScene.stage?.group.traverse((object) => stageObjects.add(object));
  galleryScene.group.traverse((object) => {
    if (stageObjects.has(object)) {
      return;
    }
    if (object instanceof Mesh || object instanceof LineSegments) {
      object.geometry.dispose();
    }
    if (object instanceof Mesh || object instanceof LineSegments || object instanceof Sprite) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        const texture = "map" in material ? material.map : null;
        texture?.dispose();
        material.dispose();
      });
    }
  });
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
