import type { MissionDefinition } from "@mma/engine-core";
import type { AssessmentItem } from "@mma/engine-assess";
import { buildLessonView, type LessonViewCopy } from "@mma/engine-lesson";
import {
  calculateCharge,
  calculateMassNumber,
  elementByAtomicNumber,
  hasCompleteOuterShell,
} from "@mma/kit-chemistry";
import type { XrLessonContent, XrModulePanelsContent } from "@mma/engine-render";
import type { AtomBuilderLearningState } from "./learning.js";

/** Inputs that are not part of learning state but appear in the immersive UI. */
export interface XrLessonExtras {
  /** Text of the most recent hint, shown as feedback. */
  readonly lastHintText: string;
  /** Current narration caption, or an empty string when captions are off. */
  readonly caption: string;
  /** "Exit VR" or "Exit AR". */
  readonly exitLabel: string;
  /** Whether an XR session is running, and which modes this device can enter. */
  readonly session: XrLessonContent["session"];
  /** Narration state for the sound and captions toggles. */
  readonly narration: {
    readonly audioEnabled: boolean;
    readonly muted: boolean;
    readonly captionsEnabled: boolean;
  };
}

/** Narration commands sent by the lesson UI's dock. */
export const NARRATION_COMMAND = {
  sound: "narration:sound",
  captions: "narration:captions",
  replay: "narration:replay",
} as const;

/** Atom Builder wording for the shared lesson view. */
const ATOM_BUILDER_LESSON_COPY: LessonViewCopy = {
  idleEyebrow: "ATOM BUILDER",
  freePlayTitle: "Build any atom",
  freePlayBody: "Add or remove particles and watch the element change.",
  notYetFeedback: "Not yet. The atom does not match every part of the goal. Adjust it and check again.",
};

/**
 * Build the immersive lesson content from learning state. Pure: the same state
 * always gives the same content, and commands match the screen UI's commands.
 */
export function buildXrLessonContent(
  state: Readonly<AtomBuilderLearningState>,
  missions: readonly MissionDefinition[],
  assessmentItems: readonly AssessmentItem[],
  extras: XrLessonExtras,
): XrLessonContent {
  const chemistry = state.chemistry;
  const electrons = chemistry.shells.reduce((sum, count) => sum + count, 0);
  const element = elementByAtomicNumber(chemistry.protons);
  const lesson = buildLessonView(state, missions, assessmentItems, extras.lastHintText, ATOM_BUILDER_LESSON_COPY);

  return {
    ...lesson,
    particles: [
      particle("proton", "Protons", chemistry.protons, "#d64c35"),
      particle("neutron", "Neutrons", chemistry.neutrons, "#287f83"),
      particle("electron", "Electrons", electrons, "#f0b323"),
    ],
    element: {
      symbol: element?.symbol ?? "",
      name: element?.name ?? "No element yet",
      rows: [
        { label: "Atomic number Z", value: String(chemistry.protons) },
        { label: "Mass number A", value: String(calculateMassNumber(chemistry.protons, chemistry.neutrons)) },
        { label: "Charge", value: formatCharge(calculateCharge(chemistry.protons, electrons)) },
        { label: "Electron configuration", value: chemistry.shells.join(",") || "0" },
        { label: "Outer shell", value: hasCompleteOuterShell(chemistry.shells) ? "Complete" : "Incomplete" },
      ],
    },
    caption: extras.caption,
    resetAtom: { label: "Reset atom", command: "atom/reset" },
    exitLabel: extras.exitLabel,
    session: extras.session,
    narration: {
      sound: {
        label: !extras.narration.audioEnabled ? "Sound off" : extras.narration.muted ? "Unmute" : "Mute",
        command: NARRATION_COMMAND.sound,
      },
      captions: {
        label: extras.narration.captionsEnabled ? "Captions on" : "Captions off",
        command: NARRATION_COMMAND.captions,
      },
      replay: { label: "Replay", command: NARRATION_COMMAND.replay },
    },
  };
}

function particle(
  id: "proton" | "neutron" | "electron",
  label: string,
  count: number,
  color: string,
): XrLessonContent["particles"][number] {
  return { id, label, count, color, addCommand: `particle:add:${id}`, removeCommand: `particle:remove:${id}` };
}

function formatCharge(charge: number): string {
  return charge > 0 ? `+${charge}` : String(charge);
}

/**
 * Show the Atom Builder content on the shared headset panels with its original layout:
 * lesson card on the left; particle steppers and the dark element card on the right;
 * caption, narration, Reset atom, Recenter and Exit in the dock.
 */
export function toModulePanelsContent(content: XrLessonContent): XrModulePanelsContent {
  return {
    lesson: content,
    side: {
      title: "",
      status: "",
      statusTone: "info",
      steppers: { title: "SUBATOMIC PARTICLES", rows: content.particles },
      info: { eyebrow: "ELEMENT", symbol: content.element.symbol, name: content.element.name, rows: content.element.rows },
      cards: [],
      actions: [],
    },
    dockActions: [content.resetAtom],
    exitLabel: content.exitLabel,
    narration: {
      caption: content.caption,
      sound: content.narration.sound,
      captions: content.narration.captions,
      replay: content.narration.replay,
    },
  };
}
