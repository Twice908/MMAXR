import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("engine-core dependency boundary", () => {
  it.each([
    "@mma/kits/chemistry",
    "@mma/modules/chem-atom-builder",
    "@mma/web",
    "three",
    "../../../apps/web/src/main.js",
    "../../kits/chemistry/index.js",
    "../../../modules/chem-atom-builder/rules.js",
    "node:fs",
  ])(
    "rejects an import from %s",
    async (specifier) => {
      const eslint = new ESLint({ cwd: process.cwd() });
      const [result] = await eslint.lintText(`import ${JSON.stringify(specifier)};`, {
        filePath: "packages/engine-core/src/dependency-boundary-fixture.ts",
      });

      expect(result?.messages.map((message) => message.ruleId)).toContain(
        "no-restricted-imports",
      );
    },
  );
});