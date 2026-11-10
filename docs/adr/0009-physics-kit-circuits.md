# ADR 0009: Physics kit with reusable circuit parts

Status: Accepted

## Context

Ohm's Law is the first physics module. The owner asked that every circuit part (battery,
resistor, switch, ammeter, voltmeter, bulb) be reusable "with a one-liner", so later
current-electricity modules (series and parallel, power) do not rebuild them. The owner's
content choices: Ohm's law only for now; cells of 1.5 V and discrete resistors; a
non-ohmic filament bulb demo; conventional current; the term "potential difference";
wrongly placed meters are rejected with a reason; no class-specific wording.

## Decision

- New package `@mma/kit-physics` (`packages/kits/physics`), depending only on
  `@mma/engine-core` types. No Three.js, DOM or I/O; lint enforces the boundary.
- Parts are plain data made by one-liners: `battery("battery", 2)`, `resistor("r", 10)`,
  `bulb("lamp", STANDARD_BULB_CURVE)`, `circuitSwitch("key")`, `ammeter("ammeter")`,
  `voltmeter("voltmeter")`, `wire("gap")`. Circuits are parts between named nodes,
  built with `seriesLoop`, `connectAcross`, `connectBetween` and `replacePart`.
- `solveCircuit` solves any DC circuit shape by modified nodal analysis with ideal
  cells and meters. Bulbs follow a V–I curve; the solve repeats until their resistance
  settles. Readings use conventional current, `a` to `b`.
- `placementIssues` checks wiring by circuit paths, not by fixed slots: voltmeter in
  series, ammeter in parallel, short circuits. Each issue has a plain-English reason.
- `createCircuitBenchReducer` is a reusable bench: set cells, toggle switch, swap or
  connect parts, record meter readings (rounded to the meter's step). Invalid changes
  leave the circuit unchanged and set `validationMessages`.
- `STANDARD_RESISTOR_OHMS` (2, 5, 10 Ω) and `STANDARD_BULB_CURVE` (a 6 V bulb) are data
  tables. The bulb values are illustrative and marked `reviewStatus: "pending"`.

## Consequences

- Series/parallel and power modules can reuse the parts, solver and bench unchanged.
- Meters are ideal; internal resistance of cells and meters is not modelled.
- The 3D circuit view (`engine-render`) and the readings table and V–I graph
  (`engine-ui`) are the next stage, with the Ohm's Law module.
