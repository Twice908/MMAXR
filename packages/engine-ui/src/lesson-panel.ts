import { LESSON_COMMAND, type LessonView } from "@mma/engine-lesson";
import { commandButton, el, setText } from "./dom.js";

/** A mounted lesson panel: mission card, check question and lesson summary. */
export interface LessonPanel {
  readonly element: HTMLElement;
  /** Redraw from the lesson view. Moves focus to a new question so keyboard users land on it. */
  update(view: LessonView): void;
}

const OPTION_STATE_TEXT = {
  idle: "",
  correct: " (your answer, correct)",
  incorrect: " (your answer, not correct)",
  answer: " (correct answer)",
} as const;

/**
 * Create the shared screen-mode lesson panel. Buttons carry `data-command` with the
 * lesson commands (`lesson:hint`, `lesson:check`, ...), so the page's own click
 * handler routes them; this panel never changes state itself.
 */
export function createLessonPanel(doc: Document = document): LessonPanel {
  const element = el(doc, "section", "mma-lesson");
  element.setAttribute("aria-label", "Mission");

  const mission = el(doc, "div", "mma-lesson__mission");
  const eyebrow = el(doc, "p", "mma-eyebrow");
  const title = el(doc, "h2", "mma-lesson__title");
  title.id = "mma-lesson-title";
  const body = el(doc, "p", "mma-lesson__body");
  const progress = el(doc, "div", "mma-progress");
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Lesson progress");
  progress.setAttribute("aria-valuemin", "0");
  progress.setAttribute("aria-valuemax", "100");
  const progressFill = el(doc, "span", "mma-progress__fill");
  progress.append(progressFill);
  const actions = el(doc, "div", "mma-lesson__actions");
  const check = commandButton(doc, "Check", LESSON_COMMAND.check, "primary");
  const hint = commandButton(doc, "Hint", LESSON_COMMAND.hint, "secondary");
  const freePlay = commandButton(doc, "Free play", LESSON_COMMAND.freePlay, "quiet");
  actions.append(check, hint, freePlay);
  const feedback = el(doc, "p", "mma-feedback");
  feedback.setAttribute("aria-live", "polite");
  mission.append(eyebrow, title, body, progress, actions, feedback);

  const question = el(doc, "section", "mma-question");
  question.setAttribute("aria-labelledby", "mma-question-prompt");
  const questionStep = el(doc, "p", "mma-eyebrow");
  const prompt = el(doc, "h3", "mma-question__prompt");
  prompt.id = "mma-question-prompt";
  prompt.tabIndex = -1;
  const options = el(doc, "div", "mma-question__options");
  options.setAttribute("role", "group");
  options.setAttribute("aria-labelledby", "mma-question-prompt");
  const questionFeedback = el(doc, "p", "mma-feedback");
  questionFeedback.setAttribute("aria-live", "polite");
  const next = commandButton(doc, "Next question", LESSON_COMMAND.continue, "primary");
  question.append(questionStep, prompt, options, questionFeedback, next);
  question.hidden = true;

  element.append(mission, question);
  let shownQuestion = "";

  return {
    element,
    update(view) {
      setText(eyebrow, view.eyebrow);
      setText(title, view.title);
      setText(body, view.body);
      body.hidden = view.body === "";
      const percent = Math.round(view.progress);
      progress.setAttribute("aria-valuenow", String(percent));
      progress.setAttribute("aria-valuetext", `${percent}% of missions done`);
      progressFill.style.width = `${percent}%`;
      setButton(check, view.check);
      setButton(hint, view.hint);
      setButton(freePlay, view.freePlay ? { ...view.freePlay, enabled: true } : null);
      actions.hidden = !view.check && !view.hint && !view.freePlay;
      setText(feedback, view.feedback);
      feedback.hidden = view.feedback === "";

      const assessment = view.assessment;
      question.hidden = assessment === null;
      if (!assessment) {
        shownQuestion = "";
        return;
      }
      setText(questionStep, assessment.step);
      setText(prompt, assessment.prompt);
      options.replaceChildren(...assessment.options.map((option) => {
        const button = commandButton(doc, option.label, option.command, "option");
        button.className = `mma-option mma-option--${option.state}`;
        button.disabled = option.disabled;
        if (OPTION_STATE_TEXT[option.state]) {
          const note = el(doc, "span", "mma-visually-hidden", OPTION_STATE_TEXT[option.state]);
          button.append(note);
        }
        return button;
      }));
      setText(questionFeedback, assessment.feedback);
      questionFeedback.hidden = assessment.feedback === "";
      next.hidden = assessment.continueLabel === null;
      if (assessment.continueLabel) setText(next, assessment.continueLabel);
      const key = `${assessment.step}:${assessment.prompt}`;
      if (key !== shownQuestion) {
        shownQuestion = key;
        prompt.focus({ preventScroll: false });
      } else if (assessment.continueLabel && doc.activeElement?.classList.contains("mma-option")) {
        next.focus();
      }
    },
  };
}

function setButton(
  button: HTMLButtonElement,
  model: { readonly label: string; readonly enabled: boolean } | null,
): void {
  button.hidden = model === null;
  if (!model) return;
  setText(button, model.label);
  button.disabled = !model.enabled;
}
