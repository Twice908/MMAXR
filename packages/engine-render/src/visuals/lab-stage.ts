import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Scene,
} from "three";
import type { PlaneMapper } from "./plane-mapper.js";
import { gridSegments } from "./grid-segments.js";
import { visualTokens, type VisualTokens } from "./tokens.js";

export interface LabStageOptions {
  readonly mapper: PlaneMapper;
  readonly tokens?: VisualTokens;
}

/** Reusable tabletop and grid, switchable between opaque and transparent modes. */
export class LabStage {
  readonly group = new Group();
  readonly plate: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly floor: Mesh<PlaneGeometry, MeshBasicMaterial>;
  readonly grid: LineSegments<BufferGeometry, LineBasicMaterial>;
  private readonly tokens: VisualTokens;
  private mode: "opaque" | "transparent" = "opaque";
  private gridVisible = true;

  constructor({ mapper, tokens = visualTokens }: LabStageOptions) {
    this.tokens = tokens;
    this.plate = new Mesh(
      new PlaneGeometry(tokens.stagePlateSize, tokens.stagePlateSize),
      new MeshBasicMaterial({ color: tokens.stagePlateColor }),
    );
    this.plate.rotation.x = -Math.PI / 2;
    this.plate.position.y = tokens.stageTableHeight;
    this.floor = new Mesh(
      new PlaneGeometry(tokens.stageFloorSize, tokens.stageFloorSize),
      new MeshBasicMaterial({ color: tokens.stageFloorColor }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = tokens.stageTableHeight - tokens.stageFloorDepth;
    const segments = gridSegments(tokens.stageGridSize, tokens.stageGridStep, tokens.stageGridMajorEvery);
    const positions: number[] = [];
    for (const segment of segments) {
      for (const point of [segment.from, segment.to]) {
        const [x, , z] = mapper.toScene(point[0], point[1]);
        positions.push(x, tokens.stageTableHeight + tokens.stageGridLift, z);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    this.grid = new LineSegments(
      geometry,
      new LineBasicMaterial({
        color: tokens.stageGridColor,
        transparent: true,
        opacity: tokens.stageOpaqueGridOpacity,
        depthWrite: false,
      }),
    );
    this.group.add(this.floor, this.plate, this.grid);
    this.syncMode();
  }

  /** Change the scene presentation without replacing any stage objects. */
  setMode(mode: "opaque" | "transparent"): void {
    this.mode = mode;
    this.syncMode();
  }

  /** Show or hide the stage grid independently of the current mode. */
  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.syncMode();
  }

  /** Release stage geometries and materials. */
  dispose(): void {
    this.plate.geometry.dispose();
    this.plate.material.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.grid.geometry.dispose();
    this.grid.material.dispose();
  }

  private syncMode(): void {
    this.plate.visible = this.mode === "opaque";
    this.floor.visible = this.mode === "opaque";
    this.grid.visible = this.gridVisible;
    this.grid.material.opacity = this.mode === "opaque"
      ? this.tokens.stageOpaqueGridOpacity
      : this.tokens.stageTransparentGridOpacity;
    const scene = findScene(this.group);
    if (scene) {
      scene.background = this.mode === "opaque" ? new Color(this.tokens.stageBackgroundColor) : null;
    }
  }
}

function findScene(group: Group): Scene | null {
  let parent = group.parent;
  while (parent) {
    if (parent instanceof Scene) {
      return parent;
    }
    parent = parent.parent;
  }
  return null;
}
