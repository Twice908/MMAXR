const MAX_KIT_ELECTRONS = 20;
const MAX_BOHR_BURY_OCCUPANCY = 8;

export type ElectronPlacementResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly message: string };

/** Return the theoretical maximum electron count for a shell number using 2n^2. */
export function shellCapacity(shellNumber: number): number {
  if (!Number.isInteger(shellNumber) || shellNumber < 1) {
    throw new RangeError("Shell number must be a positive whole number.");
  }
  return 2 * shellNumber ** 2;
}

/**
 * Fill shells in Bohr-Bury order for elements 1-20. For this level, each shell
 * fills to the lesser of its 2n^2 capacity and 8 electrons.
 */
export function bohrBuryConfiguration(electronCount: number): readonly number[] {
  if (
    !Number.isInteger(electronCount) ||
    electronCount < 0 ||
    electronCount > MAX_KIT_ELECTRONS
  ) {
    throw new RangeError("This kit supports electron counts from 0 to 20.");
  }

  let remaining = electronCount;
  const shells: number[] = [];
  for (let shellNumber = 1; remaining > 0; shellNumber += 1) {
    const capacity = Math.min(shellCapacity(shellNumber), MAX_BOHR_BURY_OCCUPANCY);
    const inShell = Math.min(remaining, capacity);
    shells.push(inShell);
    remaining -= inShell;
  }

  return Object.freeze(shells);
}

/** Check whether the outermost occupied shell is complete: 2 in shell 1, 8 later. */
export function hasCompleteOuterShell(shells: readonly number[]): boolean {
  let outermostOccupied = -1;
  for (let index = 0; index < shells.length; index += 1) {
    const count = shells[index];
    if (count === undefined || !Number.isInteger(count) || count < 0) {
      return false;
    }
    if (count > 0) {
      outermostOccupied = index;
    }
  }

  if (outermostOccupied === -1) {
    return false;
  }
  return shells[outermostOccupied] === (outermostOccupied === 0 ? 2 : 8);
}

/** Describe outer-shell completion without making a claim about nuclear stability. */
export function outerShellMessage(shells: readonly number[]): string {
  if (shells.every((count) => count === 0)) {
    return "No outer shell is occupied yet.";
  }
  return hasCompleteOuterShell(shells)
    ? "The outer shell is complete."
    : "The incomplete outer shell makes this atom or ion reactive.";
}

/** Explain whether an electron can be placed in a selected 1-based shell. */
export function validateElectronPlacement(
  shells: readonly number[],
  shellNumber: number,
): ElectronPlacementResult {
  if (!Number.isInteger(shellNumber) || shellNumber < 1 || shellNumber > 4) {
    return { valid: false, message: "Choose a shell from 1 to 4." };
  }

  if (
    shells.some((count) => !Number.isInteger(count) || count < 0) ||
    shells.some((count, index) => count > shellLimit(index + 1))
  ) {
    return { valid: false, message: "Shell counts must be whole numbers within their limits." };
  }

  for (let innerShell = 1; innerShell < shellNumber; innerShell += 1) {
    if ((shells[innerShell - 1] ?? 0) < shellLimit(innerShell)) {
      return {
        valid: false,
        message: `Fill shell ${innerShell} before adding an electron to shell ${shellNumber}.`,
      };
    }
  }

  const currentCount = shells[shellNumber - 1] ?? 0;
  if (currentCount >= shellLimit(shellNumber)) {
    if (shellNumber === 3) {
      return {
        valid: false,
        message: "For elements 1-20, shell 3 holds 8 before shell 4 is used.",
      };
    }
    return {
      valid: false,
      message: `Shell ${shellNumber} holds at most ${shellLimit(shellNumber)} electrons.`,
    };
  }

  if (shells.reduce((total, count) => total + count, 0) >= MAX_KIT_ELECTRONS) {
    return { valid: false, message: "This kit supports up to 20 electrons." };
  }

  return { valid: true };
}

/** Explain whether an electron can be removed from a selected 1-based shell. */
export function validateElectronRemoval(
  shells: readonly number[],
  shellNumber: number,
): ElectronPlacementResult {
  if (!Number.isInteger(shellNumber) || shellNumber < 1 || shellNumber > 4) {
    return { valid: false, message: "Choose a shell from 1 to 4." };
  }
  if ((shells[shellNumber - 1] ?? 0) < 1) {
    return { valid: false, message: "That shell has no electron to remove." };
  }
  if (shells.slice(shellNumber).some((count) => count > 0)) {
    return { valid: false, message: "Remove electrons from the outer shell first." };
  }
  return { valid: true };
}

function shellLimit(shellNumber: number): number {
  return Math.min(shellCapacity(shellNumber), MAX_BOHR_BURY_OCCUPANCY);
}