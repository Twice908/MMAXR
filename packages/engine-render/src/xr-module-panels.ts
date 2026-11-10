import { Container, Text } from "@pmndrs/uikit";
import { Button, Panel, ProgressBar } from "@pmndrs/uikit-horizon";
import * as THREE from "three";
import {
  XR_COMMAND,
  type XrAssessmentContent,
  type XrAssessmentOption,
  type XrCommandButton,
} from "./xr-lesson-content.js";

/**
 * Subject-neutral in-scene lesson UI for headsets and the desktop emulator, built with
 * the Meta Horizon UI kit. Generalised from the Atom Builder panels (which stay as they
 * are): the same lesson card and dock, plus a side panel that a module fills with info
 * cards and action buttons. Units: 1 unit = 1 mm after the renderer's 0.1 scale; 56 mm
 * targets and 18 mm+ text.
 */

/** A button on the side panel. */
export interface XrPanelAction {
  readonly label: string;
  readonly command: string;
  readonly variant: "primary" | "secondary";
  readonly enabled: boolean;
}

/** An info card: a heading and label/value rows. */
export interface XrPanelCard {
  readonly heading: string;
  readonly rows: readonly { readonly label: string; readonly value: string }[];
}

/** Everything the module panels show. Plain data; commands go back to the module. */
export interface XrModulePanelsContent {
  readonly lesson: {
    readonly eyebrow: string;
    readonly title: string;
    readonly body: string;
    readonly progress: number;
    readonly feedback: string;
    readonly hint: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
    readonly check: { readonly label: string; readonly command: string; readonly enabled: boolean } | null;
    readonly freePlay: { readonly label: string; readonly command: string } | null;
    readonly assessment: XrAssessmentContent | null;
  };
  readonly side: {
    readonly title: string;
    /** The next step or the latest result, in plain words. */
    readonly status: string;
    readonly statusTone: "info" | "error" | "success";
    readonly cards: readonly XrPanelCard[];
    readonly actions: readonly XrPanelAction[];
  };
  readonly exitLabel: string;
  /** Narration caption and controls in the dock; omit for a module without narration. */
  readonly narration?: {
    /** Current caption, or an empty string. */
    readonly caption: string;
    readonly sound: XrCommandButton;
    readonly captions: XrCommandButton;
    readonly replay: XrCommandButton;
  };
}

/** The three panel groups and how to update or dispose them. */
export interface XrModulePanels {
  readonly lesson: THREE.Group;
  readonly build: THREE.Group;
  readonly dock: THREE.Group;
  readonly roots: readonly Container[];
  update(content: XrModulePanelsContent): void;
  dispose(): void;
}

const TARGET = 56;
const GAP = 12;
const COLOR = {
  backplate: "#f6f8fb",
  card: "#ffffff",
  cardBorder: "#e3e8ef",
  ink: "#16243a",
  muted: "#55627a",
  accent: "#1d5fd0",
  positive: "#14866d",
  positiveBg: "#e3f5ee",
  negative: "#b3261e",
  negativeBg: "#fbe7e5",
  hover: "#eaf1fd",
  infoBg: "#eaf1fd",
} as const;

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

function backplate(width: number, extra: Record<string, unknown> = {}): Panel {
  return new Panel({
    width,
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

/** Create the panels. `onCommand` receives module commands and {@link XR_COMMAND} values. */
export function createXrModulePanels(
  initial: XrModulePanelsContent,
  onCommand: (command: string) => void,
): XrModulePanels {
  let content = initial;
  const show = (component: Container | Text, visible: boolean): void => {
    component.setProperties({ display: visible ? "flex" : "none" } as never);
  };
  const makeButton = (
    label: string,
    variant: "primary" | "secondary" | "tertiary" | "negative",
    onClick: () => void,
    extra: Record<string, unknown> = {},
  ): { button: Button; label: Text } => {
    const button = new Button({ variant, size: "lg", height: TARGET, paddingX: 24, fontSize: 20, onClick, ...extra } as never);
    const labelText = new Text({ text: label, fontSize: 20, fontWeight: "semi-bold" } as never);
    button.add(labelText);
    return { button, label: labelText };
  };

  // --- Lesson panel (left) -------------------------------------------------
  const lessonRoot = backplate(520);
  const eyebrow = eyebrowText("");
  const title = text("", 32, { fontWeight: "bold", lineHeight: "130%" });
  const body = text("", 20, { color: COLOR.muted, lineHeight: "130%" });
  const progress = new ProgressBar({ value: 0, width: "100%" } as never);
  const feedback = text("", 18, { color: COLOR.accent, lineHeight: "130%" });
  const missionCard = card();
  missionCard.add(eyebrow, title, body, text("Lesson progress", 16, { color: COLOR.muted }), progress, feedback);
  const hint = makeButton("Hint", "secondary", () => {
    if (content.lesson.hint?.enabled) onCommand(content.lesson.hint.command);
  }, { flexGrow: 1 });
  const check = makeButton("Check", "primary", () => {
    if (content.lesson.check?.enabled) onCommand(content.lesson.check.command);
  }, { flexGrow: 1 });
  const missionActions = new Container({ flexDirection: "row", gap: GAP } as never);
  missionActions.add(hint.button, check.button);
  const freePlay = makeButton("Free play", "tertiary", () => {
    if (content.lesson.freePlay) onCommand(content.lesson.freePlay.command);
  });

  const questionCard = card();
  const questionStep = eyebrowText("");
  const questionPrompt = text("", 24, { fontWeight: "semi-bold", lineHeight: "130%" });
  const options = Array.from({ length: 4 }, (_, index) => {
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
      onClick: () => {
        const option = content.lesson.assessment?.options[index];
        if (option && !option.disabled) onCommand(option.command);
      },
    } as never);
    const label = text("", 20, { lineHeight: "130%", flexShrink: 1 });
    row.add(label);
    return { row, label };
  });
  const questionFeedback = text("", 18, { color: COLOR.muted, lineHeight: "130%" });
  const questionContinue = makeButton("Continue", "primary", () => {
    if (content.lesson.assessment?.continueLabel) onCommand(content.lesson.assessment.continueCommand);
  });
  questionCard.add(questionStep, questionPrompt, ...options.map((option) => option.row), questionFeedback, questionContinue.button);
  lessonRoot.add(missionCard, missionActions, freePlay.button, questionCard);

  // --- Side panel (right): status, info cards, actions -----------------------
  const sideRoot = backplate(480);
  const sideTitle = eyebrowText("");
  const status = new Container({ padding: 16, borderRadius: 16, backgroundColor: COLOR.infoBg } as never);
  const statusText = text("", 20, { lineHeight: "130%" });
  status.add(statusText);
  const cardsHolder = new Container({ flexDirection: "column", gap: GAP } as never);
  const actionsHolder = new Container({ flexDirection: "column", gap: GAP } as never);
  sideRoot.add(sideTitle, status, cardsHolder, actionsHolder);
  let cardViews: { heading: Text; rows: { label: Text; value: Text }[] }[] = [];
  let actionViews: { button: Button; label: Text }[] = [];
  let shape = "";

  const rebuildSide = (side: XrModulePanelsContent["side"]): void => {
    for (const child of [...cardsHolder.children, ...actionsHolder.children]) {
      (child as Container).removeFromParent();
    }
    cardViews = side.cards.map((info) => {
      const view = card();
      const heading = text("", 24, { fontWeight: "bold" });
      view.add(heading);
      const rows = info.rows.map(() => {
        const label = text("", 18, { color: COLOR.muted, flexGrow: 1 });
        const value = text("", 20, { fontWeight: "semi-bold" });
        const row = new Container({ flexDirection: "row", justifyContent: "space-between", gap: 12 } as never);
        row.add(label, value);
        view.add(row);
        return { label, value };
      });
      cardsHolder.add(view);
      return { heading, rows };
    });
    actionViews = side.actions.map((action, index) => {
      const view = makeButton(action.label, action.variant, () => {
        const current = content.side.actions[index];
        if (current?.enabled) onCommand(current.command);
      }, { width: "100%" });
      actionsHolder.add(view.button);
      return view;
    });
  };

  // --- Dock (below the model) -------------------------------------------------
  const dockRoot = backplate(initial.narration ? 640 : 420, { alignItems: "center", padding: 18, gap: GAP, borderRadius: 36 });
  const caption = text("", 18, { color: COLOR.muted, textAlign: "center", lineHeight: "130%", width: "100%" });
  const sound = makeButton("Sound", "secondary", () => {
    if (content.narration) onCommand(content.narration.sound.command);
  });
  const captions = makeButton("Captions", "secondary", () => {
    if (content.narration) onCommand(content.narration.captions.command);
  });
  const replay = makeButton("Replay", "tertiary", () => {
    if (content.narration) onCommand(content.narration.replay.command);
  });
  const narrationGroup = new Container({ flexDirection: "row", gap: GAP } as never);
  narrationGroup.add(sound.button, captions.button, replay.button);
  const recenter = makeButton("Recenter", "secondary", () => onCommand(XR_COMMAND.recenter));
  // Exit stays visible and visually separate (comfort rule: a clear way out).
  const exit = makeButton(initial.exitLabel, "negative", () => onCommand(XR_COMMAND.exit));
  const viewGroup = new Container({ flexDirection: "row", gap: GAP } as never);
  viewGroup.add(recenter.button, exit.button);
  const dockRow = new Container({ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 20 } as never);
  dockRow.add(narrationGroup, viewGroup);
  dockRoot.add(caption, dockRow);

  const setOption = (target: (typeof options)[number], option: XrAssessmentOption | undefined): void => {
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

  const update = (next: XrModulePanelsContent): void => {
    content = next;
    const lesson = next.lesson;
    eyebrow.setProperties({ text: lesson.eyebrow } as never);
    title.setProperties({ text: lesson.title } as never);
    body.setProperties({ text: lesson.body } as never);
    show(body, lesson.body.length > 0);
    progress.setProperties({ value: Math.max(0, Math.min(100, lesson.progress)) } as never);
    feedback.setProperties({ text: lesson.feedback } as never);
    show(feedback, lesson.feedback.length > 0);
    const questionShowing = lesson.assessment !== null;
    show(missionActions, !questionShowing && (lesson.hint !== null || lesson.check !== null));
    show(hint.button, lesson.hint !== null);
    hint.button.setProperties({ disabled: !(lesson.hint?.enabled ?? false) } as never);
    show(check.button, lesson.check !== null);
    check.button.setProperties({ disabled: !(lesson.check?.enabled ?? false) } as never);
    show(freePlay.button, !questionShowing && lesson.freePlay !== null);
    show(questionCard, questionShowing);
    if (lesson.assessment) {
      questionStep.setProperties({ text: lesson.assessment.step } as never);
      questionPrompt.setProperties({ text: lesson.assessment.prompt } as never);
      options.forEach((option, index) => setOption(option, lesson.assessment?.options[index]));
      questionFeedback.setProperties({ text: lesson.assessment.feedback } as never);
      show(questionFeedback, lesson.assessment.feedback.length > 0);
      show(questionContinue.button, lesson.assessment.continueLabel !== null);
      questionContinue.label.setProperties({ text: lesson.assessment.continueLabel ?? "" } as never);
    }

    const side = next.side;
    const nextShape = `${side.cards.map((info) => info.rows.length).join(",")}|${side.actions.length}`;
    if (nextShape !== shape) {
      shape = nextShape;
      rebuildSide(side);
    }
    sideTitle.setProperties({ text: side.title } as never);
    statusText.setProperties({
      text: side.status,
      color: side.statusTone === "error" ? COLOR.negative : side.statusTone === "success" ? COLOR.positive : COLOR.ink,
    } as never);
    status.setProperties({
      backgroundColor: side.statusTone === "error" ? COLOR.negativeBg : side.statusTone === "success" ? COLOR.positiveBg : COLOR.infoBg,
    } as never);
    show(status, side.status.length > 0);
    side.cards.forEach((info, index) => {
      const view = cardViews[index];
      if (!view) return;
      view.heading.setProperties({ text: info.heading } as never);
      info.rows.forEach((row, rowIndex) => {
        view.rows[rowIndex]?.label.setProperties({ text: row.label } as never);
        view.rows[rowIndex]?.value.setProperties({ text: row.value } as never);
      });
    });
    side.actions.forEach((action, index) => {
      const view = actionViews[index];
      if (!view) return;
      view.label.setProperties({ text: action.label } as never);
      view.button.setProperties({ disabled: !action.enabled } as never);
    });
    exit.label.setProperties({ text: next.exitLabel } as never);
    const narration = next.narration;
    show(narrationGroup, narration !== undefined);
    caption.setProperties({ text: narration?.caption ?? "" } as never);
    show(caption, (narration?.caption ?? "").length > 0);
    if (narration) {
      sound.label.setProperties({ text: narration.sound.label } as never);
      captions.label.setProperties({ text: narration.captions.label } as never);
      replay.label.setProperties({ text: narration.replay.label } as never);
    }
  };
  update(initial);

  const roots = [lessonRoot, sideRoot, dockRoot];
  const holder = (name: string): THREE.Group => {
    const group = new THREE.Group();
    group.name = name;
    return group;
  };
  return {
    lesson: holder("module-lesson-panel"),
    build: holder("module-side-panel"),
    dock: holder("module-dock"),
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
