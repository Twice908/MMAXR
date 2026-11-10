import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("engine-lesson dependency boundary", () => {
  it.each([
    "@mma/kit-chemistry",
    "@mma/chem-atom-builder",
    "@mma/engine-render",
    "@mma/web",
    "three",
    "../../kits/chemistry/src/index.js",
    "../../../modules/chem-atom-builder/src/learning.js",
    "node:fs",
  ])(
    "rejects an import from %s",
    async (specifier) => {
      const eslint = new ESLint({ cwd: process.cwd() });
      const [result] = await eslint.lintText(`import ${JSON.stringify(specifier)};`, {
        filePath: "packages/engine-lesson/src/dependency-boundary-fixture.ts",
      });

      expect(result?.messages.map((message) => message.ruleId)).toContain("no-restricted-imports");
    },
    20_000,
  );
});
