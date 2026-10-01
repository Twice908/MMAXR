import { createStore } from "@mma/engine-core";
import { describe, expect, it } from "vitest";
import { chemistryReducer, createChemistryState } from "../src/rules.js";

describe("chemistry reducer", () => {
  it("uses engine-core dispatch actions to remove an electron and update shell state", () => {
    const store = createStore(chemistryReducer, createChemistryState(2, 2));

    store.dispatch({ type: "electron/remove", payload: { shell: 1 } });

    expect(store.getState().shells).toEqual([1]);
    expect(store.getState().validationMessages).toEqual([]);
  });

  it("rejects invalid placements without changing particles and records an explanation", () => {
    const initial = createChemistryState(11, 12, 18);
    const store = createStore(chemistryReducer, initial);

    store.dispatch({ type: "electron/place", payload: { shell: 3 } });

    expect(store.getState().shells).toEqual([2, 8, 8]);
    expect(store.getState().protons).toBe(11);
    expect(store.getState().validationMessages).toEqual([
      "For elements 1-20, shell 3 holds 8 before shell 4 is used.",
    ]);
  });

  it("explains when removal would skip an occupied outer shell", () => {
    const state = createChemistryState(11, 12, 11);
    const next = chemistryReducer(state, {
      type: "electron/remove",
      payload: { shell: 2 },
    });

    expect(next.shells).toEqual([2, 8, 1]);
    expect(next.validationMessages).toEqual([
      "Remove electrons from the outer shell first.",
    ]);
  });
});