import type { DeepReadonly } from "@mma/engine-core";
import type { LessonView } from "@mma/engine-lesson";
import type { MoleculeSceneFrame, XrModulePanelsContent } from "@mma/engine-render";
import {
  elementBySymbol,
  hasCompleteOuterShell,
  ionicAtomCharge,
  type IonicBondingAtom,
  type IonicBondingLayout,
  type IonicBondingState,
  type Point3,
} from "@mma/kit-chemistry";

/** How an ion's symbol and charge are shown: "Na" with a raised "+", "Cl" with "−". */
export interface IonText {
  readonly symbol: string;
  /** Raised charge text, such as "+", "2+", "−", or "" for a neutral atom. */
  readonly charge: string;
  /** Plain words for screen readers, such as "Na plus" or "Cl minus". */
  readonly spoken: string;
}

/** One atom card in the Move electrons panel. */
export interface BenchAtomView {
  readonly id: string;
  readonly name: string;
  readonly ion: IonText;
  /** "Metal: gives electrons" or "Non-metal: takes electrons". */
  readonly role: string;
  readonly configuration: string;
  /** For example "Incomplete: 1 outer electron" or "Complete (octet)". */
  readonly outerShell: string;
  readonly outerShellComplete: boolean;
  /** Signed charge as text: "0", "+1", "−1". */
  readonly charge: string;
  readonly canGive: boolean;
  readonly canTake: boolean;
  /** This atom's electron was picked (tapped) and waits for a taker. */
  readonly selected: boolean;
}

/** A keyboard-only move: give one outer electron from one atom to another. */
export interface BenchMove {
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

/** The status line under the model. */
export interface BenchStatus {
  readonly tone: "info" | "error" | "success";
  readonly text: string;
}

/** Everything the Move electrons panel shows. Pure: same input, same output. */
export interface BenchView {
  /** The one next step, in plain words. */
  readonly instruction: string;
  readonly atoms: readonly BenchAtomView[];
  readonly status: BenchStatus;
  readonly bonded: boolean;
  /** Join is offered until the ions are joined; the rules explain an early press. */
  readonly canJoin: boolean;
  /** Every allowed move, for the keyboard and screen-reader buttons. */
  readonly moves: readonly BenchMove[];
}

/** A grab ring drawn over one outer electron of a giving atom in the 3D model. */
export interface ElectronHandle {
  /** Stable key such as "na-1:10" (atom id and electron index). */
  readonly key: string;
  readonly atomId: string;
  /** Position in scene units (atom centre plus the electron's place on its shell). */
  readonly position: Point3;
}

/**
 * Build the panel from bonding state and the giver the student picked (UI-only
 * selection, not learning state).
 */
export function buildBenchView(
  state: DeepReadonly<IonicBondingState>,
  selectedGiverId: string | null,
  compoundName: string,
): BenchView {
  const atoms = state.atoms.map((atom) => atomView(atom, state.bonded, selectedGiverId));
  const givers = atoms.filter((atom) => atom.canGive);
  const takers = atoms.filter((atom) => atom.canTake);
  const selected = atoms.find((atom) => atom.selected && atom.canGive);
  const allComplete = state.atoms.every((atom) => hasCompleteOuterShell(atom.atom.shells));
  const ions = uniqueIonText(atoms);

  let instruction: string;
  if (state.bonded) {
    instruction = `${ions} are joined. You made ${compoundName.toLowerCase()}, ${state.formula}.`;
  } else if (allComplete) {
    instruction = `Every outer shell is complete. ${ions} have opposite charges, so they attract. Press Join the ions.`;
  } else if (selected) {
    instruction = `Now tap ${names(takers)} in the model to give it the electron.`;
  } else {
    instruction = `In the model, drag the glowing outer electron from ${names(givers)} onto ${names(takers)}.`;
  }

  const message = state.validationMessages[0];
  const status: BenchStatus = message
    ? { tone: "error", text: message }
    : state.bonded
      ? { tone: "success", text: `Ionic bond formed: ${state.formula}.` }
      : state.electronsTransferred > 0
        ? { tone: "success", text: transferSummary(atoms, state.electronsTransferred) }
        : { tone: "info", text: "" };

  const takerNames = takers.map((atom) => atom.name.toLowerCase());
  const moves = givers.flatMap((giver) =>
    takers.map((taker, index): BenchMove => {
      const repeated = takerNames.filter((name) => name === takerNames[index]).length > 1;
      const takerName = repeated
        ? `${takerNames[index]} atom ${takerNames.slice(0, index + 1).filter((name) => name === takerNames[index]).length}`
        : takerNames[index]!;
      return { from: giver.id, to: taker.id, label: `Move an outer electron from ${giver.name.toLowerCase()} to ${takerName}` };
    }),
  );

  return { instruction, atoms, status, bonded: state.bonded, canJoin: !state.bonded, moves };
}

/** Command sent by a headset move button: `ionic:move:<from>:<to>`. */
export function moveCommand(move: Pick<BenchMove, "from" | "to">): string {
  return `ionic:move:${move.from}:${move.to}`;
}

/** Parse {@link moveCommand}; null for any other command. */
export function parseMoveCommand(command: string): { from: string; to: string } | null {
  const match = /^ionic:move:([a-z0-9-]+):([a-z0-9-]+)$/.exec(command);
  return match ? { from: match[1]!, to: match[2]! } : null;
}

/**
 * Content for the in-scene panels on headsets and the desktop emulator. There is no
 * screen to drag on there, so each allowed electron move is a button.
 */
export function buildXrPanelsContent(
  lesson: LessonView,
  bench: BenchView,
  exitLabel: string,
): XrModulePanelsContent {
  const nextStep = bench.moves.length > 0
    ? "Point at a move below to give an outer electron."
    : bench.instruction;
  return {
    lesson,
    side: {
      title: "ATOMS AND IONS",
      // The Horizon panel font covers ASCII only: brackets and a plain "-", no middle dot.
      status: ascii(bench.status.text || nextStep),
      statusTone: bench.status.text ? bench.status.tone : "info",
      cards: bench.atoms.map((atom) => ({
        heading: `${atom.name} (${atom.ion.symbol}${ascii(atom.ion.charge)})`,
        rows: [
          { label: "Shells", value: atom.configuration },
          { label: "Outer shell", value: atom.outerShell },
          { label: "Charge", value: ascii(atom.charge) },
        ],
      })),
      actions: [
        ...bench.moves.map((move) => ({ label: move.label, command: moveCommand(move), variant: "primary" as const, enabled: true })),
        { label: "Join the ions", command: "ionic:join", variant: bench.moves.length === 0 ? "primary" as const : "secondary" as const, enabled: bench.canJoin },
        { label: "Start over", command: "ionic:reset", variant: "secondary" as const, enabled: true },
      ],
    },
    exitLabel,
  };
}

/** Replace the real minus sign with "-" for fonts that only cover ASCII. */
function ascii(text: string): string {
  return text.replaceAll("−", "-");
}

/** Grab rings for every outer electron of every atom that can still give one. */
export function outerElectronHandles(layout: IonicBondingLayout): readonly ElectronHandle[] {
  return layout.atoms.flatMap((atom) => {
    if (!atom.canGive) return [];
    const outer = atom.atom.rings.at(-1);
    const electrons = atom.atom.spheres.find((group) => group.id === "electron")?.positions ?? [];
    if (!outer) return [];
    return electrons.flatMap((electron, index) =>
      Math.abs(Math.hypot(electron.x, electron.y, electron.z) - outer.radius) < 1e-6
        ? [{
          key: `${atom.id}:${index}`,
          atomId: atom.id,
          position: { x: atom.position.x + electron.x, y: atom.position.y + electron.y, z: atom.position.z + electron.z },
        }]
        : [],
    );
  });
}

/**
 * Convert the kit's bonding layout to the renderer's scene frame. While the student
 * carries an electron, `liftedHandle` leaves it out of its atom so it looks picked up.
 */
export function toSceneFrame(layout: IonicBondingLayout, liftedHandle: string | null = null): MoleculeSceneFrame {
  const [liftedAtom, liftedIndex] = liftedHandle ? liftedHandle.split(":") : [];
  return {
    atoms: layout.atoms.map((atom) => ({
      id: atom.id,
      position: atom.position,
      radius: atom.radius,
      atom: atom.id === liftedAtom
        ? {
          ...atom.atom,
          spheres: atom.atom.spheres.map((group) =>
            group.id === "electron"
              ? { ...group, positions: group.positions.filter((_, index) => String(index) !== liftedIndex) }
              : group,
          ),
        }
        : atom.atom,
    })),
    links: layout.links,
  };
}

/** Show a symbol with its charge the way students write it, with a real minus sign. */
export function ionText(symbol: string, charge: number): IonText {
  if (charge === 0) return { symbol, charge: "", spoken: symbol };
  const size = Math.abs(charge) === 1 ? "" : String(Math.abs(charge));
  const sign = charge > 0 ? "+" : "−";
  return {
    symbol,
    charge: `${size}${sign}`,
    spoken: `${symbol} ${size ? `${size} ` : ""}${charge > 0 ? "plus" : "minus"}`,
  };
}

function atomView(
  atom: DeepReadonly<IonicBondingAtom>,
  bonded: boolean,
  selectedGiverId: string | null,
): BenchAtomView {
  const name = elementBySymbol(atom.symbol)?.name ?? atom.symbol;
  const charge = ionicAtomCharge(atom);
  const shells = atom.atom.shells;
  const complete = hasCompleteOuterShell(shells);
  const outer = shells.at(-1) ?? 0;
  const canGive = !bonded && atom.role === "metal" && !complete;
  const canTake = !bonded && atom.role === "non-metal" && !complete;
  const selected = canGive && atom.id === selectedGiverId;
  const ion = ionText(atom.symbol, charge);
  return {
    id: atom.id,
    name,
    ion,
    role: atom.role === "metal" ? "Metal: gives electrons" : "Non-metal: takes electrons",
    configuration: shells.join(","),
    outerShell: complete
      ? shells.length === 1 ? "Complete" : "Complete (octet)"
      : `Incomplete: ${outer} outer ${outer === 1 ? "electron" : "electrons"}`,
    outerShellComplete: complete,
    charge: charge === 0 ? "0" : `${charge > 0 ? "+" : "−"}${Math.abs(charge)}`,
    canGive,
    canTake,
    selected,
  };
}

function names(atoms: readonly BenchAtomView[]): string {
  const unique = [...new Set(atoms.map((atom) => atom.name.toLowerCase()))];
  if (unique.length === 0) return "no atom";
  return unique.length === 1 ? unique[0]! : `${unique.slice(0, -1).join(", ")} or ${unique.at(-1)}`;
}

function uniqueIonText(atoms: readonly BenchAtomView[]): string {
  const ions = [...new Set(atoms.map((atom) => `${atom.ion.symbol}${atom.ion.charge}`))];
  return ions.length <= 1 ? ions.join("") : `${ions.slice(0, -1).join(", ")} and ${ions.at(-1)}`;
}

function transferSummary(atoms: readonly BenchAtomView[], transferred: number): string {
  const moved = `${transferred} ${transferred === 1 ? "electron has" : "electrons have"} moved.`;
  const waiting = atoms.filter((atom) => !atom.outerShellComplete);
  return waiting.length === 0
    ? `${moved} Every outer shell is now complete.`
    : `${moved} ${waiting.map((atom) => atom.name.toLowerCase()).join(" and ")} still ${waiting.length === 1 ? "needs" : "need"} a complete outer shell.`;
}
