import {
  IONIC_BONDING_ACTION,
  createIonicBondingReducer,
  createIonicBondingState,
  ionicCompoundById,
  layoutIonicBonding,
  type IonicBondingState,
  type IonicCompound,
} from "@mma/kit-chemistry";
import { describe, expect, it } from "vitest";
import {
  buildBenchView,
  buildXrPanelsContent,
  ionText,
  moveCommand,
  outerElectronHandles,
  parseMoveCommand,
  toSceneFrame,
} from "../src/view-model.js";

const nacl = ionicCompoundById("nacl")!;
const mgcl2: IonicCompound = {
  id: "mgcl2",
  formula: "MgCl2",
  name: "Magnesium chloride",
  metal: { symbol: "Mg", count: 1, neutrons: 12 },
  nonMetal: { symbol: "Cl", count: 2, neutrons: 18 },
};
const reducer = createIonicBondingReducer([nacl, mgcl2]);
const apply = (state: IonicBondingState, ...actions: Parameters<typeof reducer>[1][]) =>
  actions.reduce((current, action) => reducer(current, action), state);
const transfer = (from: string, to: string) => ({ type: IONIC_BONDING_ACTION.transfer, payload: { from, to } }) as const;
const bond = { type: IONIC_BONDING_ACTION.bond, payload: null } as const;

describe("ion text", () => {
  it("raises the charge with a real minus sign and spells it out for screen readers", () => {
    expect(ionText("Na", 0)).toEqual({ symbol: "Na", charge: "", spoken: "Na" });
    expect(ionText("Na", 1)).toEqual({ symbol: "Na", charge: "+", spoken: "Na plus" });
    expect(ionText("Cl", -1)).toEqual({ symbol: "Cl", charge: "−", spoken: "Cl minus" });
    expect(ionText("Mg", 2)).toEqual({ symbol: "Mg", charge: "2+", spoken: "Mg 2 plus" });
  });
});

describe("Move electrons panel", () => {
  it("starts by telling the student exactly what to drag or tap", () => {
    const view = buildBenchView(createIonicBondingState(nacl), null, nacl.name);
    expect(view.instruction).toBe("In the model, drag the glowing outer electron from sodium onto chlorine.");
    expect(view.status).toEqual({ tone: "info", text: "" });
    expect(view.atoms.map((atom) => [atom.name, atom.configuration, atom.outerShell, atom.charge, atom.role])).toEqual([
      ["Sodium", "2,8,1", "Incomplete: 1 outer electron", "0", "Metal: gives electrons"],
      ["Chlorine", "2,8,7", "Incomplete: 7 outer electrons", "0", "Non-metal: takes electrons"],
    ]);
    expect(view.moves).toEqual([{ from: "na-1", to: "cl-1", label: "Move an outer electron from sodium to chlorine" }]);
    expect(view.canJoin).toBe(true);
  });

  it("asks for the taker once a giver is picked", () => {
    const view = buildBenchView(createIonicBondingState(nacl), "na-1", nacl.name);
    expect(view.instruction).toBe("Now tap chlorine in the model to give it the electron.");
    expect(view.atoms.map((atom) => atom.selected)).toEqual([true, false]);
  });

  it("shows the ions, complete octets and the next step after the transfer", () => {
    const view = buildBenchView(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1")), "na-1", nacl.name);
    expect(view.instruction).toBe("Every outer shell is complete. Na+ and Cl− have opposite charges, so they attract. Press Join the ions.");
    expect(view.status).toEqual({ tone: "success", text: "1 electron has moved. Every outer shell is now complete." });
    expect(view.atoms.map((atom) => [atom.configuration, atom.outerShell, atom.charge, atom.selected])).toEqual([
      ["2,8", "Complete (octet)", "+1", false],
      ["2,8,8", "Complete (octet)", "−1", false],
    ]);
    expect(view.moves).toEqual([]);
  });

  it("shows the rule's reason when a move is refused", () => {
    const view = buildBenchView(apply(createIonicBondingState(nacl), transfer("cl-1", "na-1")), null, nacl.name);
    expect(view.status).toEqual({
      tone: "error",
      text: "Chlorine is a non-metal. It takes electrons to complete its outer shell, so it does not give them away.",
    });
  });

  it("confirms the bond and stops offering Join", () => {
    const view = buildBenchView(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1"), bond), null, nacl.name);
    expect(view.instruction).toBe("Na+ and Cl− are joined. You made sodium chloride, NaCl.");
    expect(view.status).toEqual({ tone: "success", text: "Ionic bond formed: NaCl." });
    expect(view.canJoin).toBe(false);
  });

  it("works for a new table row (MgCl2) without code changes", () => {
    const start = createIonicBondingState(mgcl2);
    expect(buildBenchView(start, null, mgcl2.name).instruction).toBe(
      "In the model, drag the glowing outer electron from magnesium onto chlorine.",
    );
    expect(buildBenchView(start, null, mgcl2.name).moves.map((move) => move.label)).toEqual([
      "Move an outer electron from magnesium to chlorine atom 1",
      "Move an outer electron from magnesium to chlorine atom 2",
    ]);
    const half = apply(start, transfer("mg-1", "cl-1"));
    expect(buildBenchView(half, null, mgcl2.name).status.text).toBe(
      "1 electron has moved. magnesium and chlorine still need a complete outer shell.",
    );
    const done = apply(half, transfer("mg-1", "cl-2"), bond);
    expect(buildBenchView(done, null, mgcl2.name).instruction).toBe(
      "Mg2+ and Cl− are joined. You made magnesium chloride, MgCl2.",
    );
  });
});

describe("grab rings", () => {
  it("sit on the outer-shell electrons of atoms that can give, and nowhere else", () => {
    const layout = layoutIonicBonding(createIonicBondingState(nacl));
    const handles = outerElectronHandles(layout);
    const sodium = layout.atoms[0]!;
    const outerRadius = sodium.atom.rings.at(-1)!.radius;
    expect(handles.map((handle) => handle.key)).toEqual(["na-1:10"]);
    expect(Math.hypot(handles[0]!.position.x - sodium.position.x, handles[0]!.position.y - sodium.position.y))
      .toBeCloseTo(outerRadius);
    expect(outerElectronHandles(layoutIonicBonding(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1"))))).toEqual([]);
  });

  it("offer one ring per outer electron when a metal has two (Mg)", () => {
    expect(outerElectronHandles(layoutIonicBonding(createIonicBondingState(mgcl2))).map((handle) => handle.key))
      .toEqual(["mg-1:10", "mg-1:11"]);
  });
});

describe("scene frame", () => {
  it("leaves the carried electron out of its atom only", () => {
    const layout = layoutIonicBonding(createIonicBondingState(nacl));
    const electrons = (frame: ReturnType<typeof toSceneFrame>, index: number) =>
      frame.atoms[index]!.atom.spheres.find((group) => group.id === "electron")!.positions.length;
    const lifted = toSceneFrame(layout, "na-1:10");
    expect([electrons(lifted, 0), electrons(lifted, 1)]).toEqual([10, 17]);
    expect(electrons(toSceneFrame(layout), 0)).toBe(11);
  });

  it("passes atoms and links from the kit layout to the renderer unchanged", () => {
    const layout = layoutIonicBonding(apply(createIonicBondingState(nacl), transfer("na-1", "cl-1")));
    const frame = toSceneFrame(layout);
    expect(frame.atoms.map((atom) => [atom.id, atom.position, atom.radius])).toEqual(
      layout.atoms.map((atom) => [atom.id, atom.position, atom.radius]),
    );
    expect(frame.atoms[0]!.atom).toBe(layout.atoms[0]!.atom);
    expect(frame.links).toEqual([{ from: "na-1", to: "cl-1", kind: "attraction" }]);
  });
});

describe("headset and emulator panels", () => {
  const lesson = {
    eyebrow: "MISSION 1 OF 2",
    title: "Move an electron",
    body: "Give sodium's outer electron to chlorine.",
    progress: 0,
    feedback: "",
    hint: { label: "Hint", command: "lesson:hint", enabled: true },
    check: { label: "Check", command: "lesson:check", enabled: true },
    freePlay: { label: "Free play", command: "lesson:free-play" },
    assessment: null,
  };

  it("turns each allowed electron move into a button, with Join and Start over", () => {
    const content = buildXrPanelsContent(lesson, buildBenchView(createIonicBondingState(nacl), null, nacl.name), "Exit AR");
    expect(content.lesson).toBe(lesson);
    expect(content.exitLabel).toBe("Exit AR");
    expect(content.side.status).toBe("Point at a move below to give an outer electron.");
    expect(content.side.cards.map((info) => info.heading)).toEqual(["Sodium (Na)", "Chlorine (Cl)"]);
    expect(content.side.cards[0]!.rows).toEqual([
      { label: "Shells", value: "2,8,1" },
      { label: "Outer shell", value: "Incomplete: 1 outer electron" },
      { label: "Charge", value: "0" },
    ]);
    expect(content.side.actions).toEqual([
      { label: "Move an outer electron from sodium to chlorine", command: "ionic:move:na-1:cl-1", variant: "primary", enabled: true },
      { label: "Join the ions", command: "ionic:join", variant: "secondary", enabled: true },
      { label: "Start over", command: "ionic:reset", variant: "secondary", enabled: true },
    ]);
  });

  it("shows the result after a move and makes Join the main action", () => {
    const moved = apply(createIonicBondingState(nacl), transfer("na-1", "cl-1"));
    const content = buildXrPanelsContent(lesson, buildBenchView(moved, null, nacl.name), "Exit VR");
    expect(content.side).toMatchObject({
      status: "1 electron has moved. Every outer shell is now complete.",
      statusTone: "success",
    });
    expect(content.side.cards.map((info) => info.heading)).toEqual(["Sodium (Na+)", "Chlorine (Cl-)"]);
    expect(content.side.actions.map((action) => [action.command, action.variant, action.enabled])).toEqual([
      ["ionic:join", "primary", true],
      ["ionic:reset", "secondary", true],
    ]);
  });
});

describe("move commands", () => {
  it("round-trip through the panel command string", () => {
    expect(moveCommand({ from: "mg-1", to: "cl-2" })).toBe("ionic:move:mg-1:cl-2");
    expect(parseMoveCommand("ionic:move:mg-1:cl-2")).toEqual({ from: "mg-1", to: "cl-2" });
    expect(parseMoveCommand("ionic:join")).toBeNull();
    expect(parseMoveCommand("ionic:move:Na 1:cl")).toBeNull();
  });
});
