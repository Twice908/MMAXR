# ADR 0010: Ohm's Law screen module, circuit view, readings table and graph

Status: Accepted

## Context

Stage 3 of the Ohm's Law plan: the screen (web) view, built on the physics kit from
ADR 0009. The owner wants every part reusable by later current-electricity modules,
existing modules unchanged, and conventional current shown.

## Decision

- `@mma/kit-physics` gained `layoutSeriesLoop` (any single loop: battery in the middle
  of the bottom side, other parts along the left, top and right in current order, parts
  across others on a bracket outside them, labels inside the loop) and a bench `rewire`
  action, so moving a meter is one checked step.
- `@mma/engine-render` gained `CircuitView` (`SceneContent`): wires, cells, resistors,
  a bulb that glows with its power, a switch, and meters with a needle. Instanced charges
  move along the loop in the direction of conventional current, faster for a larger
  current; arrows show the direction, and the charges stay still for reduced motion.
- `@mma/engine-ui` gained `createDataTable` and `createXyGraph` (SVG; series differ by
  colour and marker shape, with a legend and a text summary). Both are subject-neutral.
- New module `modules/physics-ohms-law` (`phys.ohms-law`, draft, screen only):
  four missions (connect the meters, change the potential difference, change the
  resistance, test a filament bulb), eight check questions pending review, a readings
  table with V ÷ I, and a V–I graph with current across and potential difference up.
  Meters are placed from the panel or from rings in the model; wrong places are rejected
  with the kit's reason. On narrow stages the model shows only the two meter readings.
- Six electricity concepts were added to the curriculum registry, listed for Classes
  10 and 12 on all three boards (registry metadata only; no class appears in the UI).

## Stage 4: narration

- Ten Piper cues (`modules/physics-ohms-law/narration/en/`): start, each mission's start
  and end, and a wrong meter placement. Scripts are `pending` review; the MP3 and VTT
  files are drafts from the shared browser generator (Jenny voice), 0.6 MB in all.
  Spoken text says "V divided by I", "positive" and "negative" in place of symbols.
- The page uses the shared `NarrationPlayer`, asset loader and narration bar, with the
  caption under the model. The web narration bar styles moved into `engine-ui` as an
  opt-in `mma-narration-web` class; Ionic Bonding keeps its own copy unchanged.
- The in-model meter spots now pulse a ring inside a still button, so the tap target
  does not move.

## Stage 5: AR and VR

- The page mounts the shared XR session (`mountArControls`): Enter AR on Android phones
  with ARCore and on headsets, Enter VR on headsets, both on desktop through the IWSDK
  emulator. The manifest lists `screen`, `ar` and `vr`.
- Phone AR uses the shared HUD with Mission, Circuit, Readings and Sound tabs; meter
  rings and the two meter readings follow the circuit on the DOM overlay.
- Headsets and the emulator use the shared Horizon module panels: the lesson card, and
  a Circuit panel with a battery stepper, meter readings, the latest four readings, and
  actions to place meters, toggle the switch, cycle the part, record and start over.
  Panel text is ASCII only ("ohm", "/"), as the Horizon font requires.
- `CircuitView` now moves its charges from its own draw callback, so they keep moving
  inside XR sessions; the circuit is drawn at 0.03 m per unit (loop about 30 cm).
- Checked in the desktop emulator (AR session, panels). Not yet checked on an Android
  phone or a headset; see docs/ar-testing.md.

## Consequences

- A series-resistors or power module can reuse the kit layout, `CircuitView`, the
  table and the graph without changes. Parallel branches need a new layout.
- Android and headset checks are still to do. The V–I graph is not shown on headset
  panels (the latest readings are). The narration audio must be regenerated after
  the teacher edits any script.
- The graph axes (I across, V up) and the concept class list await the teacher's review.
