import type { EngineAction, MissionDefinition } from "@mma/engine-core";
import type { AssessmentItem } from "@mma/engine-assess";
import type { JourneyChapter, JourneyDefinition } from "@mma/schema";
import { JOURNEY_ACTION, type JourneyFlowState, type JourneyStatus } from "./journey-flow.js";
import { buildLessonView, lessonCommandToAction, LESSON_COMMAND, type LessonAssessmentView } from "./lesson-view.js";

/** Commands sent by journey buttons. Screen, AR and VR UIs use the same strings. */
export const JOURNEY_COMMAND = {
  play: "journey:play",
  pause: "journey:pause",
  skip: "journey:skip",
  replay: "journey:replay",
  hint: "journey:hint",
  continue: "journey:continue",
  /** Prefix of a chapter jump; the chapter index follows. */
  chapterPrefix: "journey:chapter:",
  /** Prefix of a choice answer; the option id follows. */
  answerPrefix: "journey:answer:",
} as const;

/** A button: its label and the command it sends. */
export interface JourneyButtonView {
  readonly label: string;
  readonly command: string;
}

/** One chapter in the chapter list. */
export interface JourneyChapterView {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  /** `done` and `open` chapters can be revisited; `locked` ones cannot yet. */
  readonly state: "done" | "current" | "open" | "locked";
  readonly command: string | null;
}

/** The beat that is playing. */
export interface JourneyBeatView {
  readonly id: string;
  readonly cueId: string | null;
  readonly captionText: string | null;
  readonly durationMs: number;
}

/** One option of a choice checkpoint. */
export interface JourneyOptionView {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly state: "idle" | "correct" | "incorrect";
  readonly disabled: boolean;
}

/** The chapter's checkpoint while it is asked or just solved. */
export interface JourneyCheckpointView {
  readonly id: string;
  readonly kind: "tap" | "choice";
  readonly prompt: string;
  /** Choice options; empty for tap checkpoints, which are answered on the model. */
  readonly options: readonly JourneyOptionView[];
  readonly solved: boolean;
  /** Why the last answer is wrong, or why the answer is right once solved. */
  readonly feedback: string;
  readonly hint: (JourneyButtonView & { readonly enabled: boolean }) | null;
  /** The latest hint text, or "" before any hint. */
  readonly hintText: string;
  readonly continue: JourneyButtonView | null;
}

/** Everything a journey screen (or HUD, or XR panel) shows. Built purely from state. */
export interface JourneyView {
  readonly status: JourneyStatus;
  readonly paused: boolean;
  /** For example "CHAPTER 1 OF 2". */
  readonly chapterLabel: string;
  readonly chapterTitle: string;
  readonly chapters: readonly JourneyChapterView[];
  readonly beat: JourneyBeatView | null;
  /** Camera shot to show, carried over from the chapter's latest beat that set one. */
  readonly shot: string | null;
  /** Pick target to highlight. Never set while a checkpoint is waiting, so it gives nothing away. */
  readonly highlight: string | null;
  readonly checkpoint: JourneyCheckpointView | null;
  readonly questions: LessonAssessmentView | null;
  readonly controls: {
    readonly playPause: JourneyButtonView | null;
    readonly skip: JourneyButtonView | null;
    readonly replay: JourneyButtonView | null;
  };
  /** Chapters done, 0-100. */
  readonly progress: number;
}

const QUESTION_COPY = { idleEyebrow: "", freePlayTitle: "", freePlayBody: "", notYetFeedback: "" } as const;

/** Build the journey view. Pure: the same state always gives the same view. */
export function buildJourneyView(
  state: Readonly<JourneyFlowState>,
  journey: JourneyDefinition,
  missions: readonly MissionDefinition[],
  assessmentItems: readonly AssessmentItem[],
): JourneyView {
  const position = state.journey;
  const chapters = journey.chapters;
  const chapter: JourneyChapter | undefined = chapters[position.chapterIndex];
  const done = (item: JourneyChapter) => state.missionProgress[item.missionId]?.status === "completed";
  const finished = position.status === "finished";
  const intro = position.status === "intro";

  const chapterViews = chapters.map((item, index): JourneyChapterView => {
    const current = !intro && !finished && index === position.chapterIndex;
    const reachable = !intro && index <= position.unlockedChapterIndex;
    return {
      id: item.id,
      index,
      title: item.title,
      state: current ? "current" : done(item) ? "done" : reachable ? "open" : "locked",
      command: reachable && !current && position.status !== "questions" ? `${JOURNEY_COMMAND.chapterPrefix}${index}` : null,
    };
  });

  const beat = position.status === "beats" ? chapter?.beats[position.beatIndex] : undefined;
  const lastBeatIndex = position.status === "beats" ? position.beatIndex : (chapter?.beats.length ?? 0) - 1;
  const shot = intro || finished || !chapter
    ? null
    : [...chapter.beats.slice(0, lastBeatIndex + 1)].reverse().find((item) => item.shot !== undefined)?.shot ?? null;

  const checkpoint = chapter?.checkpoint;
  const showCheckpoint = checkpoint !== undefined && (position.status === "checkpoint" || position.status === "solved");
  const solved = position.status === "solved";
  let highlight: string | null = beat?.highlight ?? null;
  if (solved && checkpoint?.kind === "tap") highlight = position.lastAnswer?.value ?? checkpoint.correctTargets[0] ?? null;

  let checkpointView: JourneyCheckpointView | null = null;
  if (showCheckpoint && checkpoint && chapter) {
    const progress = state.missionProgress[chapter.missionId];
    const mission = missions.find((item) => item.id === chapter.missionId);
    const hintsUsed = progress?.hintsUsed ?? 0;
    const answer = position.lastAnswer;
    const feedback = solved
      ? checkpoint.explanation
      : answer && !answer.correct
        ? checkpoint.wrongFeedback[answer.value] ?? checkpoint.defaultFeedback
        : "";
    const nextChapter = position.chapterIndex + 1 < chapters.length;
    checkpointView = {
      id: checkpoint.id,
      kind: checkpoint.kind,
      prompt: checkpoint.prompt,
      options: checkpoint.kind === "choice"
        ? checkpoint.options.map((option, index): JourneyOptionView => ({
          id: option.id,
          label: `${String.fromCharCode(65 + index)}. ${option.text}`,
          command: `${JOURNEY_COMMAND.answerPrefix}${option.id}`,
          state: solved && option.id === checkpoint.correctOptionId
            ? "correct"
            : !solved && answer?.value === option.id && !answer.correct ? "incorrect" : "idle",
          disabled: solved,
        }))
        : [],
      solved,
      feedback,
      hint: solved || !mission || mission.hints.length === 0
        ? null
        : { label: "Hint", command: JOURNEY_COMMAND.hint, enabled: progress?.status === "active" && hintsUsed < mission.hints.length },
      hintText: hintsUsed > 0 ? mission?.hints[hintsUsed - 1] ?? "" : "",
      continue: solved
        ? { label: state.assessmentIds.length > 0 ? "Questions" : nextChapter ? "Next chapter" : "Finish", command: JOURNEY_COMMAND.continue }
        : null,
    };
  }

  const questions = position.status === "questions"
    ? buildLessonView(state, missions, assessmentItems, "", QUESTION_COPY).assessment
    : null;

  const playPause = intro
    ? { label: "Start the journey", command: JOURNEY_COMMAND.play }
    : position.status === "beats"
      ? position.paused ? { label: "Resume", command: JOURNEY_COMMAND.play } : { label: "Pause", command: JOURNEY_COMMAND.pause }
      : null;
  const completed = chapters.filter(done).length;
  return {
    status: position.status,
    paused: position.paused,
    chapterLabel: intro ? "" : finished ? "JOURNEY COMPLETE" : `CHAPTER ${position.chapterIndex + 1} OF ${chapters.length}`,
    chapterTitle: intro || finished || !chapter ? "" : chapter.title,
    chapters: chapterViews,
    beat: beat
      ? { id: beat.id, cueId: beat.cueId ?? null, captionText: beat.captionText ?? null, durationMs: beat.durationMs }
      : null,
    shot,
    highlight,
    checkpoint: checkpointView,
    questions,
    controls: {
      playPause,
      skip: position.status === "beats" ? { label: "Skip", command: JOURNEY_COMMAND.skip } : null,
      replay: position.status === "beats" || position.status === "checkpoint" || position.status === "solved" || finished
        ? { label: finished ? "Replay last chapter" : "Replay chapter", command: JOURNEY_COMMAND.replay }
        : null,
    },
    progress: chapters.length === 0 ? 0 : (completed / chapters.length) * 100,
  };
}

/** Action for tapping a pick target on the model (answers tap checkpoints). */
export function journeyTapAction(target: string): EngineAction {
  return { type: JOURNEY_ACTION.answer, payload: { value: target } };
}

/** Action that reports a finished beat (narration ended or its time ran out). */
export function journeyBeatEndedAction(beatId: string): EngineAction {
  return { type: JOURNEY_ACTION.beatEnded, payload: { beatId } };
}

/**
 * Turn a journey button command (or a scored-question command from the lesson view)
 * into an action, or return null when the command belongs to the module.
 */
export function journeyCommandToAction(command: string): EngineAction | null {
  switch (command) {
    case JOURNEY_COMMAND.play:
      return { type: JOURNEY_ACTION.play, payload: null };
    case JOURNEY_COMMAND.pause:
      return { type: JOURNEY_ACTION.pause, payload: null };
    case JOURNEY_COMMAND.skip:
      return { type: JOURNEY_ACTION.skip, payload: null };
    case JOURNEY_COMMAND.replay:
      return { type: JOURNEY_ACTION.replayChapter, payload: null };
    case JOURNEY_COMMAND.hint:
      return { type: JOURNEY_ACTION.hint, payload: null };
    case JOURNEY_COMMAND.continue:
      return { type: JOURNEY_ACTION.continue, payload: null };
  }
  if (command.startsWith(JOURNEY_COMMAND.chapterPrefix)) {
    const index = Number(command.slice(JOURNEY_COMMAND.chapterPrefix.length));
    return Number.isInteger(index) ? { type: JOURNEY_ACTION.goToChapter, payload: { chapterIndex: index } } : null;
  }
  if (command.startsWith(JOURNEY_COMMAND.answerPrefix)) {
    const value = command.slice(JOURNEY_COMMAND.answerPrefix.length);
    return value ? { type: JOURNEY_ACTION.answer, payload: { value } } : null;
  }
  if (command === LESSON_COMMAND.continue || command.startsWith(LESSON_COMMAND.answerPrefix)) {
    return lessonCommandToAction(command, () => ({}));
  }
  return null;
}
