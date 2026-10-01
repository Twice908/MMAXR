import { describe, expect, it } from "vitest";
import {
  allElements,
  elementByAtomicNumber,
  elementBySymbol,
} from "../src/elements.js";

describe("element lookup", () => {
  it("provides every element from atomic number 1 through 20", () => {
    expect(allElements()).toHaveLength(20);
    for (let atomicNumber = 1; atomicNumber <= 20; atomicNumber += 1) {
      expect(elementByAtomicNumber(atomicNumber)?.atomicNumber).toBe(atomicNumber);
    }
  });

  it("looks up symbols without regard to case and rejects unsupported elements", () => {
    expect(elementBySymbol("na")).toEqual({
      atomicNumber: 11,
      symbol: "Na",
      name: "Sodium",
    });
    expect(elementBySymbol("U")).toBeUndefined();
    expect(elementByAtomicNumber(0)).toBeUndefined();
    expect(elementByAtomicNumber(21)).toBeUndefined();
  });
});