import type { Route } from "../router.js";

/** How the app moves between two pages. */
export type Transition =
  /** First page after loading: fade in from black. */
  | { readonly kind: "open" }
  /** Login to dashboard: jump to light speed and arrive. */
  | { readonly kind: "launch" }
  /** Dashboard to login (sign out): pull away quickly. */
  | { readonly kind: "depart" }
  /** Dashboard to an experiment: fall into its planet. */
  | { readonly kind: "dive"; readonly experimentId: string }
  /** Experiment back to the dashboard: rise out of its planet. */
  | { readonly kind: "surface"; readonly experimentId: string }
  /** Anything else: a colour crossfade. */
  | { readonly kind: "fade" };

/** Pick the transition for a page change. `from` is null on the first page after loading. */
export function transitionFor(from: Route | null, to: Route): Transition {
  if (!from) return { kind: "open" };
  if (from.name === "login" && to.name === "dashboard") return { kind: "launch" };
  if (from.name === "dashboard" && to.name === "login") return { kind: "depart" };
  if (from.name === "dashboard" && to.name === "experiment") return { kind: "dive", experimentId: to.id };
  if (from.name === "experiment" && to.name === "dashboard") return { kind: "surface", experimentId: from.id };
  return { kind: "fade" };
}

/** True when two routes show the same page. */
export function sameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false;
  return a.name !== "experiment" || (b.name === "experiment" && a.id === b.id);
}
