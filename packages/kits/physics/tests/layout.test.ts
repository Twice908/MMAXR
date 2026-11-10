import { describe, expect, it } from "vitest";
import {
  ammeter,
  battery,
  circuitSwitch,
  connectAcross,
  layoutSeriesLoop,
  resistor,
  seriesLoop,
  voltmeter,
} from "../src/index.js";

const loop = seriesLoop([battery("battery", 2), circuitSwitch("key"), ammeter("ammeter"), resistor("resistor", 10)]);
const circuit = connectAcross(loop, voltmeter("voltmeter"), "resistor");

describe("series loop layout", () => {
  const layout = layoutSeriesLoop(circuit);
  const part = (id: string) => layout?.parts.find((candidate) => candidate.id === id);

  it("puts the battery in the middle of the bottom side, facing out", () => {
    expect(part("battery")?.position).toEqual({ x: 0, y: -3, z: 0 });
    expect(part("battery")?.outward).toEqual({ x: 0, y: -1, z: 0 });
  });

  it("spreads the other parts along the left, top and right sides in current order", () => {
    expect(part("key")?.position.x).toBe(-5);
    expect(part("ammeter")?.position.y).toBe(3);
    expect(part("resistor")?.position.x).toBe(5);
    // Current runs up the left side and down the right side.
    expect(part("key")?.angle).toBeCloseTo(Math.PI / 2, 10);
    expect(part("resistor")?.angle).toBeCloseTo(-Math.PI / 2, 10);
  });

  it("puts a voltmeter on a bracket outside the part it is across", () => {
    const meter = part("voltmeter");
    expect(meter?.placement).toBe("across");
    expect(meter?.position.x).toBeGreaterThan(5);
    expect(meter?.position.y).toBeCloseTo(part("resistor")?.position.y ?? Number.NaN, 10);
  });

  it("starts the current path at the battery and closes the loop", () => {
    expect(layout?.loop[0]).toEqual({ x: 0, y: -3, z: 0 });
    expect(layout?.loop.at(-1)?.x).toBeCloseTo(0, 10);
    // One wire between each pair of loop parts, plus two bracket legs.
    expect(layout?.wires).toHaveLength(6);
  });

  it("returns null without a closed loop", () => {
    expect(layoutSeriesLoop({ components: circuit.components.filter((item) => item.id !== "key") })).toBeNull();
  });
});
