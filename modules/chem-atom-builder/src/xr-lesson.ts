import type { MissionDefinition } from "@mma/engine-core";
import { resolveTriggeredAssessmentItems, type AssessmentItem } from "@mma/engine-assess";
import {
  calculateCharge,
  calculateMassNumber,
  elementByAtomicNumber,
  hasCompleteOuterShell,
} from "@mma/kit-chemistry";
import type { XrAssessmentOption, XrLessonContent } from "@mma/engine-render";
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

const HINT_LEVELS = ["nudge", "clue", "explanation"] as const;

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
  const completed = Object.values(state.missionProgress).filter((progress) => progress.status === "completed").length;
  const missionIndex = missions.findIndex((mission) => mission.id === state.activeMissionId);
  const mission = missions[missionIndex];
  const progress = mission ? state.missionProgress[mission.id] : undefined;
  const missionActive = progress?.status === "active";
  const finished = state.mode === "mission" && state.activeMissionId === null && completed === missions.length;
  const hintCount = progress?.hintsUsed ?? 0;

  let eyebrow: string;
  let title: string;
  let body: string;
  let feedback = "";
  if (state.mode === "free-play") {
    eyebrow = "FREE PLAY";
    title = "Build any atom";
    body = "Add or remove particles and watch the element change.";
  } else if (finished) {
    const hintsUsed = Object.values(state.missionProgress).reduce((sum, item) => sum + item.hintsUsed, 0);
    eyebrow = "LESSON COMPLETE";
    title = "Well done";
    body = `${completed} missions done. ${hintsUsed} hints used. ${state.questionsCorrect} questions correct out of ${state.questionsAnswered}.`;
  } else if (mission) {
    eyebrow = `MISSION ${missionIndex + 1} OF ${missions.length}`;
    title = mission.title;
    body = mission.goalText;
    if (progress?.status === "completed") {
      feedback = "Goal met. Answer the questions to continue.";
    } else if ((progress?.attempts ?? 0) > 0) {
      feedback = "Not yet. The atom does not match every part of the goal. Adjust it and check again.";
    } else if (hintCount > 0 && extras.lastHintText) {
      feedback = `${HINT_LEVELS[Math.min(hintCount, HINT_LEVELS.length) - 1]}: ${extras.lastHintText}`;
    }
  } else {
    eyebrow = "ATOM BUILDER";
    title = "Getting ready";
    body = "";
  }

  const items = resolveTriggeredAssessmentItems(state.assessmentIds, assessmentItems);
  const item = state.mode === "free-play" ? undefined : items[state.assessmentIndex];
  const answer = state.currentAnswer;
  const assessment = item
    ? {
      step: `QUESTION ${state.assessmentIndex + 1} OF ${items.length}`,
      prompt: item.prompt,
      options: item.options.map((option, index): XrAssessmentOption => ({
        label: `${String.fromCharCode(65 + index)}. ${option.text}`,
        command: `lesson:assessment:answer:${index}`,
        state: answer?.selectedOptionIndex === index
          ? answer.correct ? "correct" : "incorrect"
          : answer && index === item.correctOptionIndex ? "answer" : "idle",
        disabled: answer !== null,
      })),
      feedback: answer
        ? `${answer.correct
          ? "Correct. "
          : `Not quite. The correct answer is ${item.options[item.correctOptionIndex]?.text ?? "shown above"}. `}${item.explanation}`
        : "",
      continueLabel: answer === null
        ? null
        : state.assessmentIndex + 1 < items.length ? "Next question" : "Continue",
      continueCommand: "lesson:assessment:continue",
    }
    : null;

  const inMission = state.mode === "mission" && !finished && mission !== undefined;
  return {
    eyebrow,
    title,
    body,
    progress: missions.length === 0 ? 0 : (completed / missions.length) * 100,
    feedback,
    hint: inMission
      ? { label: "Hint", command: "lesson:hint", enabled: missionActive && hintCount < mission.hints.length }
      : null,
    check: inMission ? { label: "Check", command: "lesson:check", enabled: missionActive } : null,
    freePlay: state.mode === "free-play" ? null : { label: "Free play", command: "lesson:free-play" },
    assessment,
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
