import type { MissionDefinition } from "@mma/engine-core";
import type { JourneyDefinition } from "@mma/schema";

/** Three chapters: a tap checkpoint, no checkpoint with scored questions, a choice checkpoint with a question. */
export const journeyMissions: readonly MissionDefinition[] = [
  { id: "m-look", title: "Look", goalText: "Find it.", goal: { chapter: "look" }, hints: ["Look left.", "It is green."] },
  {
    id: "m-listen",
    title: "Listen",
    goalText: "Listen.",
    goal: { chapter: "listen" },
    hints: [],
    onComplete: { triggerAssessments: ["assess.test.01"] },
  },
  {
    id: "m-choose",
    title: "Choose",
    goalText: "Choose.",
    goal: { chapter: "choose" },
    hints: ["Think about energy."],
    onComplete: { triggerAssessments: ["assess.test.03"] },
  },
];

export const journey: JourneyDefinition = {
  chapters: [
    {
      id: "look",
      title: "Look around",
      missionId: "m-look",
      beats: [
        { id: "look-1", captionText: "Two cells float in front of you.", shot: "wide", durationMs: 3000 },
        { id: "look-2", cueId: "cue-look", highlight: "cell:plant:chloroplast", durationMs: 4000 },
      ],
      checkpoint: {
        kind: "tap",
        id: "tap-green",
        prompt: "Tap a chloroplast.",
        explanation: "Chloroplasts are green because of chlorophyll.",
        defaultFeedback: "Not that one. Look for the green parts.",
        correctTargets: ["cell:plant:chloroplast"],
        wrongFeedback: { "cell:plant:vacuole": "That is the vacuole. It stores water." },
      },
    },
    {
      id: "listen",
      title: "Listen",
      missionId: "m-listen",
      beats: [{ id: "listen-1", captionText: "Listen.", shot: "close", durationMs: 2000 }],
    },
    {
      id: "choose",
      title: "Choose",
      missionId: "m-choose",
      beats: [{ id: "choose-1", captionText: "Pick one.", durationMs: 2000 }],
      checkpoint: {
        kind: "choice",
        id: "pick-power",
        prompt: "Which part releases energy?",
        explanation: "Mitochondria release energy from food.",
        defaultFeedback: "Try again.",
        options: [{ id: "mito", text: "Mitochondrion" }, { id: "wall", text: "Cell wall" }],
        correctOptionId: "mito",
        wrongFeedback: { wall: "The cell wall gives shape and support." },
      },
    },
  ],
};
