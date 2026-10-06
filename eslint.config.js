import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", ".kilo/worktrees/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/schema/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@mma/web",
            "@mma/engine-*",
            "@mma/kits/*",
            "@mma/modules/*",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/schema/src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@mma/web"] },
            { group: ["@mma/kits/*"] },
            { group: ["@mma/modules/*"] },
            { group: ["@mma/engine-guided"], allowTypeImports: true },
            { group: ["../../engine-guided/**"], allowTypeImports: true },
            { group: ["@mma/engine-core"] },
            { group: ["@mma/engine-input"] },
            { group: ["@mma/engine-xr"] },
            { group: ["@mma/engine-assess"] },
            { group: ["@mma/engine-render"] },
            { group: ["@mma/engine-voice"] },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine-core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@mma/kits/*",
                "@mma/modules/*",
                "@mma/web",
                "@mma/api",
                "@mma/engine-xr",
                "**/apps/**",
                "**/kits/**",
                "**/modules/**",
                "**/engine-xr/**",
                "node:*",
                "fs",
                "fs/*",
                "three",
                "three/*",
              ],
              message: "engine-core must not depend on apps, kits, modules, engine-xr, or Three.js.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Inject a clock instead of reading the system time.",
        },
        {
          object: "Math",
          property: "random",
          message: "Inject an ID generator instead of using random values.",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "Inject a clock instead of reading ambient time." },
        { name: "fetch", message: "Reducers and engine-core must not perform I/O." },
        { name: "XMLHttpRequest", message: "Reducers and engine-core must not perform I/O." },
        { name: "WebSocket", message: "Reducers and engine-core must not perform I/O." },
        { name: "window", message: "engine-core must remain framework- and DOM-agnostic." },
        { name: "document", message: "engine-core must remain framework- and DOM-agnostic." },
        { name: "navigator", message: "engine-core must remain framework- and device-agnostic." },
        { name: "crypto", message: "Inject an ID generator instead of using ambient randomness." },
      ],
      "no-console": "error",
    },
  },
  {
    files: ["packages/kits/physics/optics/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@mma/engine-core",
            "@mma/modules/*",
            "@mma/web",
            "@mma/api",
            "**/engine-core/**",
            "**/modules/**",
            "**/apps/**",
            "three",
            "three/*",
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine-guided/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@mma/curriculum",
            "@mma/schema",
            "@mma/kit-*",
            "@mma/kits/*",
            "@mma/modules/*",
            "@mma/engine-assess",
            "@mma/engine-input",
            "@mma/engine-render",
            "@mma/engine-voice",
            "@mma/engine-xr",
            "@mma/web",
            "@mma/api",
            "**/kits/**",
            "**/modules/**",
            "**/engine-render/**",
            "**/engine-voice/**",
            "**/engine-xr/**",
            "**/apps/**",
            "three",
            "three/*",
          ],
        },
      ],
    },
  },
);