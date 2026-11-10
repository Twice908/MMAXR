import type { MissionDefinition } from "@mma/engine-core";
import { assessmentItemSchema } from "@mma/engine-assess";

/** Two subject-neutral missions with two and one linked questions. */
export const missions: readonly MissionDefinition[] = [
  {
    id: "reach-three",
    title: "Reach three",
    goalText: "Set the counter to 3.",
    goal: { count: 3 },
    hints: ["Count up.", "Use the plus button.", "Press plus until it shows 3."],
    onComplete: { triggerAssessments: ["assess.test.01", "assess.test.02"] },
  },
  {
    id: "reach-zero",
    title: "Reach zero",
    goalText: "Set the counter to 0.",
    goal: { count: 0 },
    hints: ["Count down."],
    onComplete: { triggerAssessments: ["assess.test.03"] },
  },
];

const option = (id: string, text: string) => ({ id, text });

/** Raw items as a module would import them from JSON. */
export const rawItems = [
  {
    id: "assess.test.01",
    prompt: "First question?",
    options: [option("a", "One"), option("b", "Two"), option("c", "Three"), option("d", "Four")],
    correctOptionIndex: 2,
    explanation: "Three is right.",
    conceptIds: ["sci.chem.atom.structure"],
    reviewStatus: "pending",
  },
  {
    id: "assess.test.02",
    prompt: "Second question?",
    options: [option("a", "W"), option("b", "X"), option("c", "Y"), option("d", "Z")],
    correctOptionIndex: 0,
    explanation: "W is right.",
    conceptIds: ["sci.chem.atom.structure"],
    reviewStatus: "pending",
  },
  {
    id: "assess.test.03",
    prompt: "Third question?",
    options: [option("a", "P"), option("b", "Q"), option("c", "R"), option("d", "S")],
    correctOptionIndex: 1,
    explanation: "Q is right.",
    conceptIds: ["sci.chem.atom.structure"],
    reviewStatus: "pending",
  },
] as const;

export const items = rawItems.map((item) => assessmentItemSchema.parse(item));
