/** Subjects exposed by the web shell. */
export type SubjectId = "chemistry" | "physics" | "biology";

/** A parsed route, with an optional notice for invalid hashes. */
export type AppRoute =
  | { readonly kind: "start"; readonly notice?: string }
  | { readonly kind: "subject"; readonly subject: SubjectId }
  | { readonly kind: "module"; readonly moduleId: string };

const routeNotFoundNotice = "That page was not found. Choose a subject to continue.";

/** Parse the hash route while leaving the URL query string independent and intact. */
export function parseRoute(hash: string, search = ""): AppRoute {
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  if (path === "" || path === "/") {
    const legacyModuleId = query.get("module");
    if (legacyModuleId) {
      return { kind: "module", moduleId: legacyModuleId };
    }
    return { kind: "start" };
  }

  const subjectMatch = /^\/subject\/([^/]+)$/.exec(path);
  if (subjectMatch) {
    const subject = decodePathSegment(subjectMatch[1]);
    if (subject === "chemistry" || subject === "physics" || subject === "biology") {
      return { kind: "subject", subject };
    }
  }

  const moduleMatch = /^\/module\/([^/]+)$/.exec(path);
  if (moduleMatch) {
    const moduleId = decodePathSegment(moduleMatch[1]);
    if (moduleId) {
      return { kind: "module", moduleId };
    }
  }

  return { kind: "start", notice: routeNotFoundNotice };
}

/** Build a hash route on the current URL without changing its path or query. */
export function buildRoute(route: AppRoute, currentUrl: string): string {
  const url = new URL(currentUrl, "http://localhost");
  const path = route.kind === "start"
    ? "/"
    : route.kind === "subject"
      ? `/subject/${encodeURIComponent(route.subject)}`
      : `/module/${encodeURIComponent(route.moduleId)}`;
  url.hash = path;
  return `${url.pathname}${url.search}${url.hash}`;
}

function decodePathSegment(segment: string | undefined): string | null {
  if (!segment) {
    return null;
  }
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
