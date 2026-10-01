import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "modules/**/*.test.ts"],
    environment: "node",
  },
});