import { manifest as atomBuilder } from "@mma/chem-atom-builder/manifest";
import { manifest as ionicBonding } from "@mma/chem-ionic-bonding/manifest";
import { manifest as ohmsLaw } from "@mma/physics-ohms-law/manifest";
import type { Experiment } from "./catalogue.js";

/**
 * Every experiment the dashboard lists. Add a module here when it ships; its title, subject,
 * time and status come from its manifest. The module code itself loads only when it is opened.
 */
export const experiments: readonly Experiment[] = [
  {
    id: atomBuilder.id,
    subject: atomBuilder.subject,
    title: atomBuilder.title.en ?? Object.values(atomBuilder.title)[0] ?? atomBuilder.id,
    estimatedMinutes: atomBuilder.estimatedMinutes,
    releaseStatus: atomBuilder.releaseStatus,
    load: async () => {
      const [{ mountAtomBuilder }, { default: projectOptions }] = await Promise.all([
        import("@mma/chem-atom-builder"),
        import("virtual:iwsdk-project"),
      ]);
      return (root, context) => {
        if (atomBuilder.modes[0] !== "screen") {
          throw new Error("This build supports the screen mode only.");
        }
        // World options come from iwsdk.config.json, shared with the IWSDK editor.
        return mountAtomBuilder(root, {
          diagnostics: import.meta.env.DEV,
          worldOptions: projectOptions,
          onExit: context.onExit,
        });
      };
    },
  },
  {
    id: ionicBonding.id,
    subject: ionicBonding.subject,
    title: ionicBonding.title.en ?? Object.values(ionicBonding.title)[0] ?? ionicBonding.id,
    estimatedMinutes: ionicBonding.estimatedMinutes,
    releaseStatus: ionicBonding.releaseStatus,
    load: async () => {
      const [{ mountIonicBonding }, { default: projectOptions }] = await Promise.all([
        import("@mma/chem-ionic-bonding"),
        import("virtual:iwsdk-project"),
      ]);
      return (root, context) =>
        mountIonicBonding(root, { worldOptions: projectOptions, onExit: context.onExit });
    },
  },
  {
    id: ohmsLaw.id,
    subject: ohmsLaw.subject,
    title: ohmsLaw.title.en ?? Object.values(ohmsLaw.title)[0] ?? ohmsLaw.id,
    estimatedMinutes: ohmsLaw.estimatedMinutes,
    releaseStatus: ohmsLaw.releaseStatus,
    load: async () => {
      const [{ mountOhmsLaw }, { default: projectOptions }] = await Promise.all([
        import("@mma/physics-ohms-law"),
        import("virtual:iwsdk-project"),
      ]);
      return (root, context) => mountOhmsLaw(root, { worldOptions: projectOptions, onExit: context.onExit });
    },
  },
];
