import type { Soundscape } from "@mma/engine-ambience";

/** Context the app gives an experiment when it mounts. */
export interface ExperimentContext {
  /** Return to the dashboard. */
  readonly onExit: () => void;
  /** The app's shared soundscape (same on/off switch as the dashboard), for lessons that use it. */
  readonly sound?: Soundscape;
}

/** One experiment that can be opened from the dashboard. */
export interface Experiment {
  readonly id: string;
  /** Subject id; one of {@link SUBJECTS}. */
  readonly subject: string;
  readonly title: string;
  readonly estimatedMinutes: number;
  readonly releaseStatus: "draft" | "release";
  /** Load the experiment code on demand and mount it. Returns the teardown. */
  readonly load: () => Promise<(root: HTMLElement, context: ExperimentContext) => () => void>;
}

/** A subject section on the dashboard. */
export interface Subject {
  readonly id: string;
  readonly label: string;
}

/** Subjects shown on the dashboard, in order. A subject with no experiments shows "Coming soon". */
export const SUBJECTS: readonly Subject[] = [
  { id: "physics", label: "Physics" },
  { id: "chemistry", label: "Chemistry" },
  { id: "biology", label: "Biology" },
];

/** One dashboard section: a subject and its experiments (possibly none). */
export interface SubjectSection {
  readonly subject: Subject;
  readonly experiments: readonly Experiment[];
}

/** Group experiments under every subject, keeping subject order and the given experiment order. */
export function groupBySubject(
  experiments: readonly Experiment[],
  subjects: readonly Subject[] = SUBJECTS,
): readonly SubjectSection[] {
  return subjects.map((subject) => ({
    subject,
    experiments: experiments.filter((experiment) => experiment.subject === subject.id),
  }));
}

/** Find an experiment by its module id. */
export function findExperiment(
  experiments: readonly Experiment[],
  id: string,
): Experiment | undefined {
  return experiments.find((experiment) => experiment.id === id);
}
