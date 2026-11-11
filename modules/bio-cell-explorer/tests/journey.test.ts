import type { EngineAction } from "@mma/engine-core";
import { assessmentItemSchema } from "@mma/engine-assess";
import {
  JOURNEY_ACTION,
  LESSON_FLOW_ACTION,
  createJourneyFlowReducer,
  createJourneyFlowState,
  journeyTapAction,
  type JourneyFlowState,
} from "@mma/engine-lesson";
import { cellOrganelleTarget, organelleDetailTarget } from "@mma/engine-render";
import { isPresentIn, organelleById, type CellKind, type OrganelleId, type OrganellePartId } from "@mma/kit-biology";
import { moduleManifestSchema } from "@mma/schema";
import { describe, expect, it } from "vitest";
import chloroplastItems from "../assessments/chloroplasts.json";
import mitochondriaItems from "../assessments/mitochondria.json";
import recapItems from "../assessments/recap.json";
import rawManifest from "../module.json";
import { chapterDetails, shotArea, stagePlan } from "../src/scene.js";

const manifest = moduleManifestSchema.parse(rawManifest);
const journey = manifest.journey!;
const items = [...mitochondriaItems, ...chloroplastItems, ...recapItems];
const KNOWN_SHOTS = new Set(["wide", "plant", "animal", "mito-detail", "chloro-detail"]);

/** Whether a pick target exists in the scene for this chapter (a structure the cell has, or a part of an open close-up). */
function existsInScene(target: string, chapterIndex: number): boolean {
  const [kind, id, rest] = target.split(":");
  if (kind === "cell") {
    return (id === "plant" || id === "animal") && isPresentIn(rest as OrganelleId, id as CellKind) && target === cellOrganelleTarget(id, rest as string);
  }
  if (kind === "detail") {
    const details: readonly string[] = chapterDetails(journey.chapters[chapterIndex]);
    return details.includes(id as string) && organelleById(id as OrganelleId).parts.some((part) => part.id === rest)
      && target === organelleDetailTarget(id as "mitochondrion", rest as OrganellePartId);
  }
  return false;
}

describe("Cell Explorer content", () => {
  it("is a valid draft manifest with four chapters, each a mission", () => {
    expect(manifest.releaseStatus).toBe("draft");
    expect(journey.chapters.map((chapter) => chapter.id)).toEqual(["two-cells", "mitochondria", "chloroplasts", "recap"]);
    expect(journey.chapters.map((chapter) => chapter.missionId)).toEqual(manifest.missions.map((mission) => mission.id));
  });

  it("has valid scored questions, all pending review and all used once", () => {
    const parsed = items.map((item) => assessmentItemSchema.parse(item));
    expect(parsed.every((item) => item.reviewStatus === "pending")).toBe(true);
    const triggered = manifest.missions.flatMap((mission) => mission.onComplete?.triggerAssessments ?? []);
    expect([...triggered].sort()).toEqual(parsed.map((item) => item.id).sort());
    expect([...manifest.interactions.check].sort()).toEqual([...triggered].sort());
  });

  it("only uses shots, highlights and tap targets that exist in the scene", () => {
    journey.chapters.forEach((chapter, index) => {
      for (const beat of chapter.beats) {
        if (beat.shot) expect(KNOWN_SHOTS.has(beat.shot), beat.shot).toBe(true);
        if (beat.highlight) expect(existsInScene(beat.highlight, index), beat.highlight).toBe(true);
      }
      const checkpoint = chapter.checkpoint;
      if (checkpoint?.kind === "tap") {
        for (const target of [...checkpoint.correctTargets, ...Object.keys(checkpoint.wrongFeedback)]) {
          expect(existsInScene(target, index), target).toBe(true);
        }
      }
    });
  });

  it("accepts any part of the plant cell for the first checkpoint, and nothing in the animal cell", () => {
    const checkpoint = journey.chapters[0]?.checkpoint;
    expect(checkpoint?.kind).toBe("tap");
    const targets = checkpoint?.kind === "tap" ? checkpoint.correctTargets : [];
    expect(targets.every((target) => target.startsWith("cell:plant:"))).toBe(true);
    expect(targets).toContain("cell:plant:cell-wall");
  });

  it("speaks every beat: one journey cue each, whose script matches the caption", async () => {
    // Cues starting "answer-" read out a scored question's correct answer, not a beat.
    const cues = new Map((manifest.narration?.cues ?? []).filter((cue) => !cue.id.startsWith("answer-")).map((cue) => [cue.id, cue]));
    const beats = journey.chapters.flatMap((chapter) => chapter.beats);
    expect(cues.size).toBe(beats.length);
    for (const beat of beats) {
      const cue = cues.get(beat.cueId ?? "");
      expect(cue?.trigger, beat.id).toBe("journey_beat");
      expect(cue?.captionText).toBe(beat.captionText);
      expect(cue?.audio).toBe(`narration/en/generated/${beat.id}.mp3`);
      expect(cue?.captions).toBe(`narration/en/generated/${beat.id}.vtt`);
      const script = (await import(`../narration/en/${beat.id}.json`)).default as { text: string; reviewStatus: string };
      expect(script).toEqual({ text: beat.captionText, reviewStatus: "pending" });
    }
  });

  it("keeps every shot inside the stage plan", () => {
    for (const arrangement of [stagePlan(1.6), stagePlan(0.5)]) {
      for (const shot of KNOWN_SHOTS) expect(shotArea(shot, arrangement).width).toBeGreaterThan(0);
    }
  });
});

describe("Cell Explorer journey", () => {
  const reduce = createJourneyFlowReducer(journey, manifest.missions, items);
  const act = (type: string, payload: EngineAction["payload"] = null): EngineAction => ({ type, payload });

  it("plays from the first beat to the end, with every checkpoint and question", () => {
    let state: JourneyFlowState = reduce(createJourneyFlowState(manifest.missions), act(JOURNEY_ACTION.play));
    const answers: Record<string, EngineAction> = {
      "tap-plant-cell": journeyTapAction("cell:plant:nucleus"),
      "tap-cristae": journeyTapAction("detail:mitochondrion:cristae"),
      "tap-chloroplast": journeyTapAction("cell:plant:chloroplast"),
      "which-has-both": act(JOURNEY_ACTION.answer, { value: "plant" }),
    };
    for (let step = 0; step < 200 && state.journey.status !== "finished"; step += 1) {
      const status = state.journey.status;
      if (status === "beats") state = reduce(state, act(JOURNEY_ACTION.skip));
      else if (status === "checkpoint") {
        const checkpoint = journey.chapters[state.journey.chapterIndex]?.checkpoint;
        state = reduce(state, answers[checkpoint?.id ?? ""] as EngineAction);
      } else if (status === "solved") state = reduce(state, act(JOURNEY_ACTION.continue));
      else if (status === "questions") {
        state = state.currentAnswer
          ? reduce(state, act(LESSON_FLOW_ACTION.continue))
          : reduce(state, act(LESSON_FLOW_ACTION.answer, { selectedOptionIndex: 0 }));
      }
    }
    expect(state.journey.status).toBe("finished");
    expect(Object.values(state.missionProgress).every((progress) => progress.status === "completed")).toBe(true);
    // Every drafted question has its right answer first.
    expect(state.questionsAnswered).toBe(6);
    expect(state.questionsCorrect).toBe(6);
  });

  it("explains a wrong tap at the cristae checkpoint", () => {
    const cristae = journey.chapters[1]?.checkpoint;
    expect(cristae?.wrongFeedback["detail:mitochondrion:matrix"]).toMatch(/matrix/);
  });
});
