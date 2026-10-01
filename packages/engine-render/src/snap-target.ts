/** Candidate surface hit by a pointer ray. */
export interface SnapCandidate {
  readonly target: string;
  readonly distance: number;
  readonly priority?: number;
}

/** Choose the nearest valid snap target, using priority and name to break ties. */
export function selectSnapTarget(
  candidates: readonly SnapCandidate[],
  maxDistance = Number.POSITIVE_INFINITY,
): string | null {
  const validCandidates = candidates
    .filter((candidate) =>
      candidate.target.length > 0 &&
      Number.isFinite(candidate.distance) &&
      candidate.distance >= 0 &&
      candidate.distance <= maxDistance,
    )
    .slice()
    .sort((left, right) =>
      left.distance - right.distance ||
      (right.priority ?? 0) - (left.priority ?? 0) ||
      left.target.localeCompare(right.target),
    );

  return validCandidates[0]?.target ?? null;
}