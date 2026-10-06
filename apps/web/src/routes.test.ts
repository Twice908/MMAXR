import { describe, expect, it } from "vitest";
import { buildRoute, parseRoute } from "./routes.js";

describe("hash routes", () => {
  it.each([
    ["", { kind: "start" }],
    ["#/", { kind: "start" }],
    ["#/subject/chemistry", { kind: "subject", subject: "chemistry" }],
    ["#/module/chem.atom-builder", { kind: "module", moduleId: "chem.atom-builder" }],
  ] as const)("parses %s", (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });

  it("keeps query values independent for module deep links", () => {
    const query = "?concept=atoms%20and%20ions&level=extended";
    expect(parseRoute("#/module/chem.atom-builder", query)).toEqual({
      kind: "module",
      moduleId: "chem.atom-builder",
    });
    expect(buildRoute(
      { kind: "subject", subject: "chemistry" },
      `https://example.test/academy/${query}#/module/chem.atom-builder`,
    )).toBe(`/academy/${query}#/subject/chemistry`);
  });

  it("supports the legacy module query", () => {
    expect(parseRoute("#/", "?module=chem.atom-builder")).toEqual({
      kind: "module",
      moduleId: "chem.atom-builder",
    });
  });

  it("returns Start with a notice for unknown and malformed routes", () => {
    expect(parseRoute("#/unknown")).toMatchObject({ kind: "start", notice: expect.any(String) });
    expect(parseRoute("#/subject/not-a-subject")).toMatchObject({ kind: "start", notice: expect.any(String) });
    expect(parseRoute("#/module/%E0%A4%A")).toMatchObject({ kind: "start", notice: expect.any(String) });
  });
});
