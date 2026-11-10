/**
 * The atom layout now lives in the chemistry kit so other chemistry modules can
 * draw atoms the same way. These re-exports keep the Atom Builder's names.
 */
export {
  layoutAtom,
  type AtomLayout,
  type ElectronSlotLayout,
  type Point3,
  type RingLayout,
  type SphereGroup,
} from "@mma/kit-chemistry";
