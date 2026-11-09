import { Container, Text } from "@pmndrs/uikit";
import { Button, Panel, ProgressBar } from "@pmndrs/uikit-horizon";
import * as THREE from "three";
import {
  XR_COMMAND,
  type XrAssessmentOption,
  type XrLessonContent,
} from "./xr-lesson-content.js";

/**
 * Lesson UI built with the Meta Horizon UI kit (`@pmndrs/uikit-horizon`), following
 * the Meta Horizon OS UI Set patterns: every control sits on a rounded backplate,
 * actions are pill buttons with clear primary / secondary / destructive roles, and
 * information is grouped into cards.
 *
 * Units: UIKit lays out in centimetres (100 units = 1 m). The renderer scales the
 * panels by 0.1, so 1 unit = 1 mm: body text 20 mm, titles 32 mm, targets 56 mm
 * (comfortable for both rays and pokes at about 1 m). Line heights are percentages:
 * UIKit reads a bare number as a multiple of the font size.
 */

const TARGET = 56;
const GAP = 12;
/** Light Horizon palette (matches `spatialUI.preferredColorScheme: "light"`). */
const COLOR = {
  backplate: "#f6f8fb",
  card: "#ffffff",
  cardBorder: "#e3e8ef",
  ink: "#16243a",
  muted: "#55627a",
  accent: "#1d5fd0",
  infoCard: "#14243d",
  infoInk: "#ffffff",
  infoMuted: "#9fb3d1",
  positive: "#14866d",
  positiveBg: "#e3f5ee",
  negative: "#b3261e",
  negativeBg: "#fbe7e5",
  hover: "#eaf1fd",
} as const;

/** The three UI groups and how to update or dispose them. */
export interface XrLessonPanels {
  /** Left: mission, feedback, check questions. */
  readonly lesson: THREE.Group;
  /** Right: particle steppers and element facts. */
  readonly build: THREE.Group;
  /** Below the atom: caption, narration, view controls and Exit. */
  readonly dock: THREE.Group;
  /** The UIKit roots in the order lesson, build, dock. */
  readonly roots: readonly Container[];
  update(content: XrLessonContent): void;
  dispose(): void;
}

type ButtonVariant = "primary" | "secondary" | "tertiary" | "positive" | "negative";

interface LabeledButton {
  readonly button: Button;
  readonly label: Text;
}

interface OptionRow {
  readonly row: Container;
  readonly label: Text;
}

function text(value: string, fontSize: number, extra: Record<string, unknown> = {}): Text {
  return new Text({ text: value, fontSize, color: COLOR.ink, ...extra } as never);
}

function eyebrowText(value: string): Text {
  return text(value, 16, { color: COLOR.accent, fontWeight: "bold", letterSpacing: 2 });
}

function card(extra: Record<string, unknown> = {}): Container {
  return new Container({
    flexDirection: "column",
    gap: GAP,
    padding: 20,
    borderRadius: 20,
    backgroundColor: COLOR.card,
    borderWidth: 2,
    borderColor: COLOR.cardBorder,
    ...extra,
  } as never);
}

function backplate(width: number | undefined, extra: Record<string, unknown> = {}): Panel {
  return new Panel({
    ...(width === undefined ? {} : { width }),
    padding: 28,
    gap: 16,
    flexDirection: "column",
    borderRadius: 32,
    backgroundColor: COLOR.backplate,
    borderColor: COLOR.cardBorder,
    borderWidth: 2,
    ...extra,
  } as never);
}

/**
 * Create the lesson UI. `onCommand` receives module commands (for example
 * `lesson:check`) and the commands in {@link XR_COMMAND}.
 */
export function createXrLessonPanels(
  initial: XrLessonContent,
  onCommand: (command: string) => void,
): XrLessonPanels {
  let content = initial;

  const makeButton = (
    label: string,
    variant: ButtonVariant,
    onClick: () => void,
    extra: Record<string, unknown> = {},
  ): LabeledButton => {
    const button = new Button({
      variant,
      size: "lg",
      height: TARGET,
      paddingX: 24,
      fontSize: 20,
      onClick: () => onClick(),
      ...extra,
    } as never);
    const labelText = new Text({ text: label, fontSize: 20, fontWeight: "semi-bold" } as never);
    button.add(labelText);
    return { button, label: labelText };
  };
  const show = (component: Container | Text, visible: boolean): void => {
    component.setProperties({ display: visible ? "flex" : "none" } as never);
  };

  // --- Lesson panel (left) -------------------------------------------------
  const lessonRoot = backplate(520);
  const eyebrow = eyebrowText("");
  const title = text("", 32, { fontWeight: "bold", lineHeight: "130%" });
  const body = text("", 20, { color: COLOR.muted, lineHeight: "130%" });
  const progressLabel = text("Lesson progress", 16, { color: COLOR.muted });
  const progress = new ProgressBar({ value: 0, width: "100%" } as never);
  const feedback = text("", 18, { color: COLOR.accent, lineHeight: "130%" });
  const missionCard = card();
  missionCard.add(eyebrow, title, body, progressLabel, progress, feedback);

  const hint = makeButton("Hint", "secondary", () => {
    if (content.hint?.enabled) onCommand(content.hint.command);
  }, { flexGrow: 1 });
  const check = makeButton("Check", "primary", () => {
    if (content.check?.enabled) onCommand(content.check.command);
  }, { flexGrow: 1 });
  const missionActions = new Container({ flexDirection: "row", gap: GAP } as never);
  missionActions.add(hint.button, check.button);
  const freePlay = makeButton("Free play", "tertiary", () => {
    if (content.freePlay) onCommand(content.freePlay.command);
  });

  const questionCard = card();
  const questionStep = eyebrowText("");
  const questionPrompt = text("", 24, { fontWeight: "semi-bold", lineHeight: "130%" });
  // Answer options wrap long text, so they are rows rather than fixed-height pills.
  const optionButtons = Array.from({ length: 4 }, (_, index): OptionRow => {
    const row = new Container({
      width: "100%",
      minHeight: TARGET,
      paddingX: 20,
      paddingY: 14,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: COLOR.cardBorder,
      backgroundColor: COLOR.card,
      alignItems: "center",
      cursor: "pointer",
      hover: { backgroundColor: COLOR.hover },
      active: { backgroundColor: COLOR.cardBorder },
      onClick: () => {
        const option = content.assessment?.options[index];
        if (option && !option.disabled) onCommand(option.command);
      },
    } as never);
    const label = text("", 20, { lineHeight: "130%", flexShrink: 1 });
    row.add(label);
    return { row, label };
  });
  const questionFeedback = text("", 18, { color: COLOR.muted, lineHeight: "130%" });
  const questionContinue = makeButton("Continue", "primary", () => {
    if (content.assessment?.continueLabel) onCommand(content.assessment.continueCommand);
  });
  questionCard.add(
    questionStep,
    questionPrompt,
    ...optionButtons.map((option) => option.row),
    questionFeedback,
    questionContinue.button,
  );
  lessonRoot.add(missionCard, missionActions, freePlay.button, questionCard);

  // --- Build panel (right) -------------------------------------------------
  const buildRoot = backplate(480);
  const particlesCard = card();
  particlesCard.add(eyebrowText("SUBATOMIC PARTICLES"));
  const particleRows = initial.particles.map((row, index) => {
    const swatch = new Container({ width: 28, height: 28, borderRadius: 14, backgroundColor: row.color } as never);
    const label = text(row.label, 20, { color: COLOR.muted });
    const count = text(String(row.count), 34, { fontWeight: "bold" });
    const labels = new Container({ flexDirection: "column", flexGrow: 1 } as never);
    labels.add(label, count);
    const minus = makeButton("-", "secondary", () => {
      const current = content.particles[index];
      if (current) onCommand(current.removeCommand);
    }, { width: TARGET, paddingX: 0 });
    const plus = makeButton("+", "primary", () => {
      const current = content.particles[index];
      if (current) onCommand(current.addCommand);
    }, { width: TARGET, paddingX: 0 });
    const rowContainer = new Container({ flexDirection: "row", alignItems: "center", gap: 16 } as never);
    rowContainer.add(swatch, labels, minus.button, plus.button);
    particlesCard.add(rowContainer);
    return { label, count };
  });

  const infoCard = new Container({
    flexDirection: "column",
    gap: 10,
    padding: 22,
    borderRadius: 20,
    backgroundColor: COLOR.infoCard,
  } as never);
  const symbol = text("", 56, { fontWeight: "bold", color: COLOR.infoInk });
  const elementName = text("", 24, { fontWeight: "semi-bold", color: COLOR.infoInk });
  const elementHeader = new Container({ flexDirection: "row", alignItems: "center", gap: 18 } as never);
  elementHeader.add(symbol, elementName);
  infoCard.add(eyebrowText("ELEMENT"), elementHeader);
  const propertyRows = initial.element.rows.map(() => {
    const label = text("", 18, { color: COLOR.infoMuted, flexGrow: 1 });
    const value = text("", 20, { fontWeight: "semi-bold", color: COLOR.infoInk });
    const rowContainer = new Container({ flexDirection: "row", justifyContent: "space-between", gap: 12 } as never);
    rowContainer.add(label, value);
    infoCard.add(rowContainer);
    return { label, value };
  });
  buildRoot.add(particlesCard, infoCard);

  // --- Dock (below the atom) ----------------------------------------------
  // 56 cm wide: about 38 degrees at 0.8 m, so both control groups stay in comfortable view.
  const dockRoot = backplate(560, { alignItems: "center", padding: 18, gap: GAP, borderRadius: 36 });
  const caption = text("", 18, { color: COLOR.muted, textAlign: "center", lineHeight: "130%", width: "100%" });
  const sound = makeButton("Sound", "secondary", () => onCommand(content.narration.sound.command));
  const captions = makeButton("Captions", "secondary", () => onCommand(content.narration.captions.command));
  const replay = makeButton("Replay", "tertiary", () => onCommand(content.narration.replay.command));
  const resetAtom = makeButton(initial.resetAtom.label, "secondary", () => onCommand(content.resetAtom.command));
  const recenter = makeButton("Recenter", "secondary", () => onCommand(XR_COMMAND.recenter));
  // Exit stays visible and visually separate (comfort rule: a clear way out).
  const exit = makeButton(initial.exitLabel, "negative", () => onCommand(XR_COMMAND.exit));
  const narrationGroup = new Container({ flexDirection: "row", gap: GAP } as never);
  narrationGroup.add(sound.button, captions.button, replay.button);
  const viewGroup = new Container({ flexDirection: "row", gap: GAP } as never);
  viewGroup.add(resetAtom.button, recenter.button, exit.button);
  const dockActions = new Container({
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 20,
  } as never);
  dockActions.add(narrationGroup, viewGroup);
  dockRoot.add(caption, dockActions);

  const setOption = (target: OptionRow, option: XrAssessmentOption | undefined): void => {
    show(target.row, option !== undefined);
    if (!option) return;
    target.label.setProperties({ text: option.label } as never);
    const good = option.state === "correct" || option.state === "answer";
    const bad = option.state === "incorrect";
    target.row.setProperties({
      backgroundColor: good ? COLOR.positiveBg : bad ? COLOR.negativeBg : COLOR.card,
      borderColor: good ? COLOR.positive : bad ? COLOR.negative : COLOR.cardBorder,
      cursor: option.disabled ? "default" : "pointer",
    } as never);
  };

  const update = (next: XrLessonContent): void => {
    content = next;
    eyebrow.setProperties({ text: next.eyebrow } as never);
    title.setProperties({ text: next.title } as never);
    body.setProperties({ text: next.body } as never);
    show(body, next.body.length > 0);
    progress.setProperties({ value: Math.max(0, Math.min(100, next.progress)) } as never);
    feedback.setProperties({ text: next.feedback } as never);
    show(feedback, next.feedback.length > 0);

    const questionShowing = next.assessment !== null;
    show(missionActions, !questionShowing && (next.hint !== null || next.check !== null));
    show(hint.button, next.hint !== null);
    hint.button.setProperties({ disabled: !(next.hint?.enabled ?? false) } as never);
    show(check.button, next.check !== null);
    check.button.setProperties({ disabled: !(next.check?.enabled ?? false) } as never);
    show(freePlay.button, !questionShowing && next.freePlay !== null);

    show(questionCard, questionShowing);
    if (next.assessment) {
      questionStep.setProperties({ text: next.assessment.step } as never);
      questionPrompt.setProperties({ text: next.assessment.prompt } as never);
      optionButtons.forEach((button, index) => setOption(button, next.assessment?.options[index]));
      questionFeedback.setProperties({ text: next.assessment.feedback } as never);
      show(questionFeedback, next.assessment.feedback.length > 0);
      show(questionContinue.button, next.assessment.continueLabel !== null);
      questionContinue.label.setProperties({ text: next.assessment.continueLabel ?? "" } as never);
    }

    next.particles.forEach((row, index) => {
      const view = particleRows[index];
      if (!view) return;
      view.label.setProperties({ text: row.label } as never);
      view.count.setProperties({ text: String(row.count) } as never);
    });
    symbol.setProperties({ text: next.element.symbol || "–" } as never);
    elementName.setProperties({ text: next.element.name } as never);
    next.element.rows.forEach((row, index) => {
      const view = propertyRows[index];
      if (!view) return;
      view.label.setProperties({ text: row.label } as never);
      view.value.setProperties({ text: row.value } as never);
    });

    sound.label.setProperties({ text: next.narration.sound.label } as never);
    captions.label.setProperties({ text: next.narration.captions.label } as never);
    replay.label.setProperties({ text: next.narration.replay.label } as never);
    caption.setProperties({ text: next.caption } as never);
    show(caption, next.caption.length > 0);
    resetAtom.label.setProperties({ text: next.resetAtom.label } as never);
    exit.label.setProperties({ text: next.exitLabel } as never);
  };
  update(initial);

  const roots = [lessonRoot, buildRoot, dockRoot];
  const holder = (name: string): THREE.Group => {
    const group = new THREE.Group();
    group.name = name;
    return group;
  };

  return {
    lesson: holder("lesson-panel"),
    build: holder("build-panel"),
    dock: holder("lesson-dock"),
    roots,
    update,
    dispose: () => {
      for (const root of roots) {
        root.removeFromParent();
        root.dispose();
      }
    },
  };
}
