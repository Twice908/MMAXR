import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/schema/**/*.ts"],
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
                "**/apps/**",
                "**/kits/**",
                "**/modules/**",
                "node:*",
                "fs",
                "fs/*",
                "three",
                "three/*",
              ],
              message: "engine-core must not depend on apps, kits, modules, or Three.js.",
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
);