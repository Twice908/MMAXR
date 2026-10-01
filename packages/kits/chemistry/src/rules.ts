import type { Reducer } from "@mma/engine-core";
import {
  bohrBuryConfiguration,
  validateElectronPlacement,
  validateElectronRemoval,
} from "./electron-shells.js";

/** Serializable atom state consumed by chemistry rules. */
export interface ChemistryState {
  readonly protons: number;
  readonly neutrons: number;
  readonly shells: readonly number[];
  readonly validationMessages: readonly string[];
}

/** Actions that change particle counts or place/remove an electron. */
export type ChemistryAction =
  | {
      readonly type: "particle/place";
      readonly payload: {
        readonly particle: "proton" | "neutron" | "electron";
        readonly target: "nucleus" | "shell";
        readonly shell?: number;
      };
    }
  | {
      readonly type: "particle/add";
      readonly payload: { readonly particle: "proton" | "neutron" };
    }
  | {
      readonly type: "particle/remove";
      readonly payload: { readonly particle: "proton" | "neutron" };
    }
  | {
      readonly type: "electron/place";
      readonly payload: { readonly shell: number };
    }
  | {
      readonly type: "electron/remove";
      readonly payload: { readonly shell: number };
    }
  | { readonly type: "atom/reset"; readonly payload: null }
  | { readonly type: "validation/clear"; readonly payload: null };

/** Create a neutral atom state, or an ion state when an electron count is supplied. */
export function createChemistryState(
  protons: number,
  neutrons: number,
  electrons = protons,
): ChemistryState {
  if (!Number.isInteger(protons) || protons < 1 || protons > 20) {
    throw new RangeError("This kit supports elements with 1 to 20 protons.");
  }
  if (!Number.isSafeInteger(neutrons) || neutrons < 0) {
    throw new RangeError("Neutrons must be a non-negative whole number.");
  }
  if (!Number.isInteger(electrons) || electrons < 0 || electrons > 20) {
    throw new RangeError("This kit supports electron counts from 0 to 20.");
  }

  return {
    protons,
    neutrons,
    shells: bohrBuryConfiguration(electrons),
    validationMessages: [],
  };
}

/** Apply one chemistry action, preserving the state and explaining rejected placements. */
export const chemistryReducer: Reducer<ChemistryState, ChemistryAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case "particle/place": {
      if (action.payload.particle === "electron") {
        if (action.payload.target !== "shell") {
          return reject(state, "Electrons belong on a shell, not in the nucleus.");
        }
        const shell = action.payload.shell ?? 0;
        const validation = validateElectronPlacement(state.shells, shell);
        if (!validation.valid) {
          return reject(state, validation.message);
        }
        const shells = [...state.shells];
        while (shells.length < shell) {
          shells.push(0);
        }
        shells[shell - 1] = (shells[shell - 1] ?? 0) + 1;
        return { ...state, shells, validationMessages: [] };
      }

      if (action.payload.target !== "nucleus") {
        return reject(state, "Protons and neutrons belong in the nucleus, not on an electron shell.");
      }
      if (action.payload.particle === "proton") {
        if (state.protons >= 20) {
          return reject(state, "This kit supports elements 1 to 20.");
        }
        return { ...state, protons: state.protons + 1, validationMessages: [] };
      }
      return { ...state, neutrons: state.neutrons + 1, validationMessages: [] };
    }
    case "particle/add": {
      if (action.payload.particle === "proton") {
        if (state.protons >= 20) {
          return reject(state, "This kit supports elements 1 to 20.");
        }
        return { ...state, protons: state.protons + 1, validationMessages: [] };
      }
      return { ...state, neutrons: state.neutrons + 1, validationMessages: [] };
    }
    case "particle/remove": {
      if (action.payload.particle === "proton") {
        if (state.protons <= 1) {
          return reject(state, "An atom needs at least one proton.");
        }
        return { ...state, protons: state.protons - 1, validationMessages: [] };
      }
      if (state.neutrons <= 0) {
        return reject(state, "There is no neutron to remove.");
      }
      return { ...state, neutrons: state.neutrons - 1, validationMessages: [] };
    }
    case "electron/place": {
      const validation = validateElectronPlacement(state.shells, action.payload.shell);
      if (!validation.valid) {
        return reject(state, validation.message);
      }
      const shells = [...state.shells];
      while (shells.length < action.payload.shell) {
        shells.push(0);
      }
      shells[action.payload.shell - 1] = (shells[action.payload.shell - 1] ?? 0) + 1;
      return { ...state, shells, validationMessages: [] };
    }
    case "electron/remove": {
      const validation = validateElectronRemoval(state.shells, action.payload.shell);
      if (!validation.valid) {
        return reject(state, validation.message);
      }
      const shells = [...state.shells];
      shells[action.payload.shell - 1] = (shells[action.payload.shell - 1] ?? 0) - 1;
      while (shells.at(-1) === 0) {
        shells.pop();
      }
      return { ...state, shells, validationMessages: [] };
    }
    case "atom/reset":
      return createChemistryState(1, 0);
    case "validation/clear":
      return state.validationMessages.length > 0
        ? { ...state, validationMessages: [] }
        : state;
  }
};

function reject(state: ChemistryState, message: string): ChemistryState {
  return { ...state, validationMessages: [message] };
}
