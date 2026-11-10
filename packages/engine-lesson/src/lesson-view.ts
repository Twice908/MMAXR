import type { EngineAction, JsonValue, MissionDefinition } from "@mma/engine-core";
import { resolveTriggeredAssessmentItems, type AssessmentItem } from "@mma/engine-assess";
import { LESSON_FLOW_ACTION, type LessonFlowState } from "./lesson-flow.js";

/** Commands sent by lesson buttons. Screen, AR and VR UIs use the same strings. */
export const LESSON_COMMAND = {
  hint: "lesson:hint",
  check: "lesson:check",
  freePlay: "lesson:free-play",
  continue: "lesson:assessment:continue",
  /** Prefix of an answer command; the option index (0-3) follows. */
  answerPrefix: "lesson:assessment:answer:",
} as const;

/** Module-specific wording used by {@link buildLessonView}. */
export interface LessonViewCopy {
  /** Eyebrow shown before the first mission starts, such as "ATOM BUILDER". */
  readonly idleEyebrow: string;
  readonly freePlayTitle: string;
  readonly freePlayBody: string;
  /** Feedback after a Check that does not meet the goal yet. */
  readonly notYetFeedback: string;
}

/** One answer option of the current check question. */
export interface LessonAssessmentOptionView {
  readonly label: string;
  readonly command: string;
  readonly state: "idle" | "correct" | "incorrect" | "answer";
  readonly disabled: boolean;
}

/** The current check question, if one is showing. */
export interface LessonAssessmentView {
  readonly step: string;
  readonly prompt: string;
  readonly options: readonly LessonAssessmentOptionView[];
  readonly feedback: string;
  /** Label of the continue button, or null while it is hidden. */
  readonly continueLabel: string | null;
  readonly continueCommand: string;
}

/** Subject-neutral lesson content: mission copy, buttons, progress and the check question. */
export interface LessonView {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  /** Mission progress, 0-100. */
  readonly progress: number;
  readonly feedback: string;
  readonly hint: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
  readonly check: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
  readonly freePlay: { readonly label: string; readonly command: string } | null;
  readonly assessment: LessonAssessmentView | null;
}

const HINT_LEVELS = ["nudge", "clue", "explanation"] as const;

/**
 * Build the lesson content from lesson state. Pure: the same state always gives
 * the same content. Modules add their own subject panels beside it.
 */
export function buildLessonView(
  state: Readonly<LessonFlowState>,
  missions: readonly MissionDefinition[],
  assessmentItems: readonly AssessmentItem[],
  lastHintText: string,
  copy: LessonViewCopy,
): LessonView {
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
    title = copy.freePlayTitle;
    body = copy.freePlayBody;
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
      feedback = copy.notYetFeedback;
    } else if (hintCount > 0 && lastHintText) {
      feedback = `${HINT_LEVELS[Math.min(hintCount, HINT_LEVELS.length) - 1]}: ${lastHintText}`;
    }
  } else {
    eyebrow = copy.idleEyebrow;
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
      options: item.options.map((option, index): LessonAssessmentOptionView => ({
        label: `${String.fromCharCode(65 + index)}. ${option.text}`,
        command: `${LESSON_COMMAND.answerPrefix}${index}`,
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
      continueCommand: LESSON_COMMAND.continue,
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
      ? { label: "Hint", command: LESSON_COMMAND.hint, enabled: missionActive && hintCount < mission.hints.length }
      : null,
    check: inMission ? { label: "Check", command: LESSON_COMMAND.check, enabled: missionActive } : null,
    freePlay: state.mode === "free-play" ? null : { label: "Free play", command: LESSON_COMMAND.freePlay },
    assessment,
  };
}

/**
 * Turn a lesson button command into a lesson action, or return null when the
 * command belongs to the module. `checkState` builds the flat record a Check compares
 * with the mission goal; it is only called for the Check command.
 */
export function lessonCommandToAction(
  command: string,
  checkState: () => Readonly<Record<string, JsonValue>>,
): EngineAction | null {
  switch (command) {
    case LESSON_COMMAND.hint:
      return { type: LESSON_FLOW_ACTION.hint, payload: null };
    case LESSON_COMMAND.check:
      return { type: LESSON_FLOW_ACTION.checkMission, payload: { state: checkState() } };
    case LESSON_COMMAND.freePlay:
      return { type: LESSON_FLOW_ACTION.freePlay, payload: null };
    case LESSON_COMMAND.continue:
      return { type: LESSON_FLOW_ACTION.continue, payload: null };
  }
  const answerMatch = /^lesson:assessment:answer:([0-3])$/.exec(command);
  return answerMatch
    ? { type: LESSON_FLOW_ACTION.answer, payload: { selectedOptionIndex: Number(answerMatch[1]) } }
    : null;
}
