import { describe, expect, it } from "vitest";
import type { Session } from "./auth/session.js";
import { parseRoute, resolveRoute, routeHash } from "./router.js";

const session: Session = { username: "Asha", studentRef: "stu_1", signedInAt: 0, expiresAt: 1 };
const known = ["chem.atom-builder"];

describe("parseRoute", () => {
  it("reads the three pages", () => {
    expect(parseRoute("#/login")).toEqual({ name: "login" });
    expect(parseRoute("#/dashboard")).toEqual({ name: "dashboard" });
    expect(parseRoute("#/experiment/chem.atom-builder")).toEqual({
      name: "experiment",
      id: "chem.atom-builder",
    });
  });

  it("sends empty, unknown and broken hashes to the dashboard", () => {
    expect(parseRoute("")).toEqual({ name: "dashboard" });
    expect(parseRoute("#/nope")).toEqual({ name: "dashboard" });
    expect(parseRoute("#/experiment/")).toEqual({ name: "dashboard" });
    expect(parseRoute("#/experiment/%E0%A4%A")).toEqual({ name: "dashboard" });
  });

  it("round-trips through routeHash, including ids that need escaping", () => {
    for (const route of [
      { name: "login" },
      { name: "dashboard" },
      { name: "experiment", id: "a b/c" },
    ] as const) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });
});

describe("resolveRoute", () => {
  it("shows only the login page when signed out", () => {
    expect(resolveRoute({ name: "dashboard" }, null, known)).toEqual({ name: "login" });
    expect(resolveRoute({ name: "experiment", id: known[0]! }, null, known)).toEqual({ name: "login" });
    expect(resolveRoute({ name: "login" }, null, known)).toEqual({ name: "login" });
  });

  it("skips the login page when signed in", () => {
    expect(resolveRoute({ name: "login" }, session, known)).toEqual({ name: "dashboard" });
  });

  it("lets a signed-in student open a known experiment", () => {
    const route = { name: "experiment", id: known[0]! } as const;
    expect(resolveRoute(route, session, known)).toEqual(route);
  });

  it("sends an unknown experiment id to the dashboard", () => {
    expect(resolveRoute({ name: "experiment", id: "bio.cell" }, session, known)).toEqual({
      name: "dashboard",
    });
  });
});
