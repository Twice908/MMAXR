import type { Session } from "./auth/session.js";

/** The pages of the app, from the URL hash. */
export type Route =
  | { readonly name: "login" }
  | { readonly name: "dashboard" }
  | { readonly name: "experiment"; readonly id: string };

const EXPERIMENT_PREFIX = "#/experiment/";

/** Read a route from `location.hash`. Anything unknown becomes the dashboard. */
export function parseRoute(hash: string): Route {
  if (hash === "#/login") return { name: "login" };
  if (hash.startsWith(EXPERIMENT_PREFIX)) {
    const raw = hash.slice(EXPERIMENT_PREFIX.length);
    try {
      const id = decodeURIComponent(raw);
      if (id.length > 0) return { name: "experiment", id };
    } catch {
      // A broken escape sequence falls through to the dashboard.
    }
  }
  return { name: "dashboard" };
}

/** Build the hash for a route. */
export function routeHash(route: Route): string {
  switch (route.name) {
    case "login":
      return "#/login";
    case "dashboard":
      return "#/dashboard";
    case "experiment":
      return `${EXPERIMENT_PREFIX}${encodeURIComponent(route.id)}`;
  }
}

/**
 * Apply the access rules: signed-out people only see the login page, and signed-in
 * people skip it. Unknown experiment ids go back to the dashboard.
 */
export function resolveRoute(
  route: Route,
  session: Session | null,
  knownExperimentIds: readonly string[],
): Route {
  if (!session) return { name: "login" };
  if (route.name === "login") return { name: "dashboard" };
  if (route.name === "experiment" && !knownExperimentIds.includes(route.id)) {
    return { name: "dashboard" };
  }
  return route;
}
