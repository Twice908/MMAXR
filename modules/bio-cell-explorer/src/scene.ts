import type { CameraShot, CellSceneDetail, CellSceneFrame, OrganelleDetailKind } from "@mma/engine-render";
import { organelleById, type CellLayout, type OrganelleId, type OrganellePartId, type Vec3 } from "@mma/kit-biology";
import type { JourneyChapter } from "@mma/schema";

/** Cells side by side (landscape) or one above the other (portrait phones). */
export type StageArrangement = "wide" | "tall";

/** Where the two cells sit, in content units. */
export interface StagePlan {
  readonly arrangement: StageArrangement;
  readonly plant: Vec3;
  readonly animal: Vec3;
}

/**
 * The organelle a close-up opens: one real mitochondrion in the animal cell, or one real
 * chloroplast in the plant cell. The camera zooms into it and the opened model takes its place.
 */
export interface OrganelleSpot {
  readonly organelle: OrganelleDetailKind;
  readonly cellId: string;
  /** Id of the placed organelle the close-up replaces. */
  readonly instanceId: string;
  /** Centre, in content units. */
  readonly position: Vec3;
  /** Length of the opened model, a little larger than the organelle so it covers it. */
  readonly length: number;
}

/** Below this width-to-height ratio the cells are stacked. */
export const TALL_BELOW_ASPECT = 0.9;
/** The opened model is this much longer than the organelle it replaces. */
export const DETAIL_GROWTH = 1.15;
/** Which cell each close-up zooms into. */
export const DETAIL_CELL: Readonly<Record<OrganelleDetailKind, "plant" | "animal">> = { mitochondrion: "animal", chloroplast: "plant" };
/** Shot shown before the journey starts: the cells far away in empty space. */
export const INTRO_SHOT = "space";

/** Arrange the stage for a viewport aspect ratio (width / height). */
export function stagePlan(aspect: number): StagePlan {
  return aspect < TALL_BELOW_ASPECT
    ? { arrangement: "tall", plant: { x: 0, y: 1.95, z: 0 }, animal: { x: 0, y: -1.95, z: 0 } }
    : { arrangement: "wide", plant: { x: -2.6, y: 0, z: 0 }, animal: { x: 2.7, y: 0, z: 0 } };
}

/**
 * Pick the organelle a close-up opens: of that kind in its cell, the one nearest the viewer
 * and the middle of the cell, so the zoom lands on something clearly visible.
 */
export function organelleSpot(organelle: OrganelleDetailKind, cells: readonly CellLayout[]): OrganelleSpot | null {
  const cell = cells.find((item) => item.kind === DETAIL_CELL[organelle]);
  if (!cell) return null;
  let best: CellLayout["organelles"][number] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const placed of cell.organelles) {
    if (placed.organelle !== organelle) continue;
    const score = placed.position.z - 0.35 * Math.hypot(placed.position.x, placed.position.y);
    if (score > bestScore) {
      best = placed;
      bestScore = score;
    }
  }
  if (!best) return null;
  return {
    organelle,
    cellId: cell.id,
    instanceId: best.id,
    position: add(cell.position, best.position),
    length: best.size.x * DETAIL_GROWTH,
  };
}

/** The area a shot keeps in view: its centre, size, and the model's turn and tilt. */
export interface ShotArea {
  readonly focus: Vec3;
  readonly width: number;
  readonly height: number;
  readonly yaw: number;
  readonly pitch: number;
}

/** The area each shot id frames. Unknown ids frame both cells. Close-ups frame their organelle. */
export function shotArea(shotId: string, plan: StagePlan, cells: readonly CellLayout[] = []): ShotArea {
  const tall = plan.arrangement === "tall";
  const middle = { x: (plan.plant.x + plan.animal.x) / 2, y: (plan.plant.y + plan.animal.y) / 2, z: 0 };
  switch (shotId) {
    case INTRO_SHOT:
      return { focus: middle, width: tall ? 30 : 60, height: tall ? 60 : 30, yaw: -0.6, pitch: 0.5 };
    case "plant":
      return { focus: plan.plant, width: 5.6, height: 4, yaw: -0.35, pitch: 0.3 };
    case "animal":
      return { focus: plan.animal, width: 4.8, height: 4, yaw: 0.3, pitch: 0.3 };
    case "mito-detail":
    case "chloro-detail": {
      const kind = detailForShot(shotId) as OrganelleDetailKind;
      const spot = organelleSpot(kind, cells);
      const cell = DETAIL_CELL[kind] === "plant" ? plan.plant : plan.animal;
      return spot
        ? { focus: spot.position, width: spot.length * 1.3, height: spot.length * 0.9, yaw: -0.45, pitch: 0.35 }
        : { focus: cell, width: 4.8, height: 4, yaw: 0.3, pitch: 0.3 };
    }
    default:
      return tall
        ? { focus: middle, width: 5, height: 7.8, yaw: -0.2, pitch: 0.2 }
        : { focus: middle, width: 10.4, height: 4, yaw: -0.2, pitch: 0.25 };
  }
}

/**
 * Viewing distance that keeps a `width` x `height` area in view at a viewport aspect ratio,
 * with a vertical field of view in degrees and a little room around it.
 */
export function fitDistance(width: number, height: number, aspect: number, fovDegrees = 40, margin = 1.18): number {
  const halfVertical = Math.tan((fovDegrees * Math.PI) / 360);
  const halfHorizontal = halfVertical * aspect;
  // Plus room for the model's own depth, in proportion to its size.
  return Math.max((height * margin) / 2 / halfVertical, (width * margin) / 2 / halfHorizontal) + Math.max(width, height) * 0.25;
}

/** Share of the frame height kept free below the model for captions and questions. */
export const WORDS_ROOM = 0.3;

/**
 * The camera shot for a shot id on this stage and viewport. The model sits in the upper part
 * of the frame, leaving {@link WORDS_ROOM} of the height below it for the floating words.
 */
export function cameraShot(shotId: string, plan: StagePlan, aspect: number, fovDegrees = 40, cells: readonly CellLayout[] = []): CameraShot {
  const area = shotArea(shotId, plan, cells);
  const height = area.height / (1 - WORDS_ROOM);
  const room = shotId === INTRO_SHOT ? 0 : (height - area.height) / 2;
  return {
    focus: { x: area.focus.x, y: area.focus.y - room, z: area.focus.z },
    distance: fitDistance(area.width, room > 0 ? height : area.height, aspect, fovDegrees),
    yaw: area.yaw,
    pitch: area.pitch,
  };
}

/** The close-up model a shot id shows, if any. */
export function detailForShot(shotId: string | null): OrganelleDetailKind | null {
  if (shotId === "mito-detail") return "mitochondrion";
  if (shotId === "chloro-detail") return "chloroplast";
  return null;
}

/** Close-up models a chapter uses (for checks that its targets exist). */
export function chapterDetails(chapter: JourneyChapter | undefined): readonly OrganelleDetailKind[] {
  const kinds = new Set<OrganelleDetailKind>();
  for (const beat of chapter?.beats ?? []) {
    const kind = detailForShot(beat.shot ?? null);
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

/**
 * Everything the cell view draws: both cells, and the opened close-up (if any) in place of
 * the real organelle it zooms into, which is hidden while the close-up shows.
 */
export function buildSceneFrame(cells: readonly CellLayout[], spots: readonly OrganelleSpot[]): CellSceneFrame {
  return {
    cells,
    details: spots.map((spot): CellSceneDetail => ({
      id: spot.organelle,
      organelle: spot.organelle,
      position: spot.position,
      length: spot.length,
      yaw: 0,
      cutaway: true,
    })),
    hiddenOrganelles: spots.map((spot) => `${spot.cellId}:${spot.instanceId}`),
  };
}

/** A name pinned to a point on the model. */
export interface StageLabel {
  readonly id: string;
  readonly text: string;
  /** Point in content units the label points at. */
  readonly anchor: Vec3;
  readonly tone: "cell" | "organelle" | "part";
  /** Cell names sit above their cell, or below it when another cell is stacked above. */
  readonly side: "above" | "below" | "point";
  /** The highlighted structure's label is drawn stronger. */
  readonly emphasis: boolean;
}

/** Where each part label points on a close-up model, as fractions of its length. */
const PART_ANCHORS: Readonly<Record<OrganelleDetailKind, Partial<Record<OrganellePartId, Vec3>>>> = {
  mitochondrion: {
    "outer-membrane": { x: 0.12, y: 0.22, z: 0 },
    "inner-membrane": { x: -0.36, y: 0.15, z: 0.04 },
    cristae: { x: 0.02, y: 0.02, z: 0.1 },
    matrix: { x: 0.34, y: -0.1, z: -0.04 },
  },
  chloroplast: {
    "outer-membrane": { x: 0.1, y: 0.2, z: 0 },
    "inner-membrane": { x: -0.36, y: 0.12, z: 0.04 },
    grana: { x: 0.01, y: 0, z: 0.12 },
    stroma: { x: 0.38, y: -0.06, z: -0.02 },
  },
};

/** What the stage shows right now, from the journey view. */
export interface StageMoment {
  readonly status: string;
  readonly shot: string | null;
  readonly highlight: string | null;
}

/**
 * Labels pinned to the model for this moment: the two cell names, the highlighted
 * structure's name, and every part of an opened close-up. None while a checkpoint
 * waits for an answer, so labels never give the answer away.
 */
export function stageLabels(moment: StageMoment, plan: StagePlan, cells: readonly CellLayout[]): readonly StageLabel[] {
  if (moment.status === "intro" || moment.status === "checkpoint" || moment.status === "questions") return [];
  const labels: StageLabel[] = [];
  const detail = detailForShot(moment.shot);
  const spot = detail ? organelleSpot(detail, cells) : null;
  if (detail && spot) {
    for (const part of organelleById(detail).parts) {
      const offset = PART_ANCHORS[detail][part.id];
      if (!offset) continue;
      labels.push({
        id: `detail:${detail}:${part.id}`,
        text: part.name,
        anchor: add(spot.position, scale(offset, spot.length)),
        tone: "part",
        side: "point",
        emphasis: moment.highlight === `detail:${detail}:${part.id}`,
      });
    }
    return labels;
  }
  for (const cell of cells) {
    const below = plan.arrangement === "tall" && cell.position.y < 0;
    const reach = cell.body.size.y / 2 + 0.35;
    labels.push({
      id: `cell:${cell.id}`,
      text: cell.kind === "plant" ? "Plant cell" : "Animal cell",
      anchor: add(cell.position, { x: 0, y: below ? -reach : reach, z: 0 }),
      tone: "cell",
      side: below ? "below" : "above",
      emphasis: false,
    });
  }
  const highlighted = moment.highlight?.split(":");
  if (highlighted?.[0] === "cell" && highlighted[1] && highlighted[2]) {
    const cell = cells.find((item) => item.id === highlighted[1]);
    const organelle = highlighted[2] as OrganelleId;
    const anchor = cell ? organelleAnchor(cell, organelle) : null;
    if (cell && anchor) {
      labels.push({ id: moment.highlight as string, text: organelleById(organelle).name, anchor, tone: "organelle", side: "point", emphasis: true });
    }
  }
  return labels;
}

/** A point on one structure of a cell to pin its label to, in content units. */
export function organelleAnchor(cell: CellLayout, organelle: OrganelleId): Vec3 | null {
  const local = ((): Vec3 | null => {
    const { size } = cell.body;
    switch (organelle) {
      case "cell-wall":
      case "cell-membrane":
        return { x: size.x * 0.42, y: -size.y * 0.36, z: size.z * 0.4 };
      case "nucleus":
        return cell.nucleus.position;
      case "vacuole":
        return cell.vacuoles[0]?.position ?? null;
      case "golgi-apparatus":
        return cell.golgi[0]?.position ?? null;
      case "endoplasmic-reticulum": {
        const { facing, outerRadius } = cell.reticulum;
        return add(cell.nucleus.position, scale(facing, outerRadius));
      }
      case "mitochondrion":
      case "chloroplast":
      case "lysosome":
      case "ribosome": {
        // The one nearest the viewer, so the label points at something visible.
        const placed = cell.organelles.filter((item) => item.organelle === organelle);
        const front = placed.reduce<(typeof placed)[number] | null>((best, item) => (!best || item.position.z > best.position.z ? item : best), null);
        return front?.position ?? null;
      }
      default:
        return null;
    }
  })();
  return local ? add(cell.position, local) : null;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}
