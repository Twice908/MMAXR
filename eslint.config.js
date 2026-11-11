import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", ".kilo/worktrees/**"],
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
    files: ["packages/engine-ui/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@mma/kits/*",
                "@mma/kit-*",
                "@mma/modules/*",
                "@mma/chem-*",
                "@mma/web",
                "@mma/engine-render",
                "**/apps/**",
                "**/kits/**",
                "**/modules/**",
                "three",
                "three/*",
              ],
              message: "engine-ui is subject-neutral DOM UI: no apps, kits, modules, renderers or Three.js.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine-ambience/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@mma/kits/*",
                "@mma/kit-*",
                "@mma/modules/*",
                "@mma/chem-*",
                "@mma/physics-*",
                "@mma/web",
                "@mma/api",
                "@mma/engine-lesson",
                "@mma/engine-ui",
                "@mma/engine-xr",
                "**/apps/**",
                "**/kits/**",
                "**/modules/**",
              ],
              message: "engine-ambience is the subject-neutral shell (cosmos, sound, veil): no apps, kits, modules or lesson packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/engine-lesson/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@mma/kits/*",
                "@mma/kit-*",
                "@mma/modules/*",
                "@mma/chem-*",
                "@mma/web",
                "@mma/api",
                "@mma/engine-render",
                "@mma/engine-xr",
                "**/apps/**",
                "**/kits/**",
                "**/modules/**",
                "node:*",
                "three",
                "three/*",
              ],
              message: "engine-lesson is subject- and renderer-neutral: no apps, kits, modules, renderers or Three.js.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Inject a clock instead of reading the system time." },
        { object: "Math", property: "random", message: "Inject an ID generator instead of using random values." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "Date", message: "Inject a clock instead of reading ambient time." },
        { name: "window", message: "engine-lesson must remain DOM-agnostic." },
        { name: "document", message: "engine-lesson must remain DOM-agnostic." },
        { name: "fetch", message: "Lesson reducers must not perform I/O." },
      ],
      "no-console": "error",
    },
  },
  {
    files: ["packages/kits/physics/**/*.ts", "packages/kits/biology/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@mma/kit-*",
                "@mma/modules/*",
                "@mma/chem-*",
                "@mma/physics-*",
                "@mma/bio-*",
                "@mma/web",
                "@mma/engine-render",
                "@mma/engine-ui",
                "@mma/engine-xr",
                "**/apps/**",
                "**/modules/**",
                "three",
                "three/*",
              ],
              message: "Physics and biology kits hold pure subject rules: no apps, modules, other kits, renderers, UI or Three.js.",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Inject a clock instead of reading the system time." },
        { object: "Math", property: "random", message: "Inject an ID generator instead of using random values." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Kit rules must remain DOM-agnostic." },
        { name: "document", message: "Kit rules must remain DOM-agnostic." },
        { name: "fetch", message: "Kit rules must not perform I/O." },
      ],
      "no-console": "error",
    },
  },
);
