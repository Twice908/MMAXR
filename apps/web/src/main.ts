import "./shell.css";
import "./camera-view.css";
import "./routes.css";
import "./experience-menu.css";
import { loadCatalogue, loadModuleRuntime, subjects, type CatalogueEntry } from "./catalogue.js";
import { mountExperienceMenu } from "./experience-menu.js";
import { buildRoute, parseRoute, type AppRoute, type SubjectId } from "./routes.js";

const appRoot = document.querySelector<HTMLElement>("#app");

if (!appRoot) {
  throw new Error("App root element is missing");
}
const app: HTMLElement = appRoot;
app.className = "app-shell";
app.innerHTML = '<div class="shell-loading" role="status">Loading...</div>';
let moduleTeardown: (() => void) | null = null;
let cataloguePromise: Promise<readonly CatalogueEntry[]> | null = null;
let renderSequence = 0;

/**
 * The mouse adapter maps every wheel event to atom zoom and prevents the default,
 * so let the browser scroll first: a wheel over anything that can still scroll in
 * the requested direction keeps its native scroll and never reaches the renderer.
 */
function scrollableAncestor(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  for (let node: HTMLElement | null = target as HTMLElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
  }
  return null;
}

app.addEventListener("wheel", (event: WheelEvent): void => {
  const node = scrollableAncestor(event.target);
  if (!node) {
    return;
  }
  const canScroll = event.deltaY < 0
    ? node.scrollTop > 0
    : node.scrollTop + node.clientHeight < node.scrollHeight - 1;
  if (canScroll) {
    event.stopPropagation();
  }
}, { capture: true, passive: true });

const query = new URLSearchParams(window.location.search);

if (import.meta.env.DEV && (query.has("gallery") || query.has("visual-gallery"))) {
  void import("./visual-gallery.js")
    .then(({ mountVisualGallery }) => mountVisualGallery(app))
    .catch(showLoadError);
} else if (import.meta.env.DEV && query.has("narration-generator")) {
  void import("./narration-generator.js")
    .then(({ mountNarrationGenerator }) => mountNarrationGenerator(app))
    .catch(showLoadError);
} else {
  window.addEventListener("hashchange", () => void renderRoute());
  void renderRoute();
}

async function renderRoute(): Promise<void> {
  const sequence = ++renderSequence;
  leaveCurrentModule();
  const route = parseRoute(window.location.hash, window.location.search);

  try {
    cataloguePromise ??= loadCatalogue();
    const catalogue = await cataloguePromise;
    if (sequence !== renderSequence) {
      return;
    }
    if (route.kind === "start") {
      renderStart(catalogue, route.notice);
      return;
    }
    if (route.kind === "subject") {
      renderSubject(catalogue, route.subject);
      return;
    }

    const entry = catalogue.find(({ id }) => id === route.moduleId);
    if (!entry) {
      renderStart(catalogue, "That experience was not found. Choose a subject to continue.");
      return;
    }
    await mountModule(entry, catalogue, sequence);
  } catch (error) {
    if (sequence === renderSequence) {
      showLoadError(error);
    }
  }
}

function renderStart(catalogue: readonly CatalogueEntry[], notice?: string): void {
  const page = document.createElement("main");
  page.className = "start-page";
  const header = document.createElement("header");
  header.className = "academy-header";
  header.innerHTML = '<span class="brand-mark" aria-hidden="true">M</span><span>Math Maam Academy</span>';
  const heading = document.createElement("h1");
  heading.textContent = "Welcome. What would you like to explore?";
  page.append(header, heading);

  if (notice) {
    const noticeElement = document.createElement("p");
    noticeElement.className = "route-notice";
    noticeElement.setAttribute("role", "status");
    noticeElement.textContent = notice;
    page.append(noticeElement);
  }

  const subjectList = document.createElement("nav");
  subjectList.className = "subject-list";
  subjectList.setAttribute("aria-label", "Subjects");
  for (const subject of subjects) {
    const count = catalogue.filter((entry) => entry.subject === subject.id).length;
    const card = makeRouteLink(
      `${subject.title}, ${count} ${count === 1 ? "experience" : "experiences"}`,
      { kind: "subject", subject: subject.id },
      "subject-card",
    );
    const title = document.createElement("span");
    title.className = "subject-card-title";
    title.textContent = subject.title;
    const detail = document.createElement("span");
    detail.className = "subject-card-detail";
    detail.textContent = count === 0
      ? "Experiences are on the way"
      : `${count} ${count === 1 ? "experience" : "experiences"}`;
    card.replaceChildren(title, detail);
    card.setAttribute(
      "aria-label",
      `${subject.title}, ${count} ${count === 1 ? "experience" : "experiences"}${count === 0 ? ". Experiences are on the way" : ""}`,
    );
    subjectList.append(card);
  }
  page.append(subjectList);

  if (import.meta.env.DEV) {
    const tools = document.createElement("section");
    tools.className = "developer-tools";
    tools.setAttribute("aria-labelledby", "developer-tools-title");
    const title = document.createElement("h2");
    title.id = "developer-tools-title";
    title.textContent = "Developer tools";
    const gallery = document.createElement("a");
    gallery.href = buildDevToolUrl("gallery");
    gallery.textContent = "Visual gallery";
    const narration = document.createElement("a");
    narration.href = buildDevToolUrl("narration-generator");
    narration.textContent = "Narration generator";
    tools.append(title, gallery, narration);
    page.append(tools);
  }

  app.replaceChildren(page);
}

function renderSubject(catalogue: readonly CatalogueEntry[], subjectId: SubjectId): void {
  const subject = subjects.find(({ id }) => id === subjectId);
  if (!subject) {
    renderStart(catalogue, "That subject was not found. Choose a subject to continue.");
    return;
  }

  const page = document.createElement("main");
  page.className = "subject-page";
  page.append(makeRouteLink("Back to Start", { kind: "start" }, "back-link"));
  const heading = document.createElement("h1");
  heading.textContent = subject.title;
  page.append(heading);

  const experiences = catalogue.filter((entry) => entry.subject === subjectId);
  if (experiences.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Experiences are on the way";
    page.append(emptyState);
  } else {
    const list = document.createElement("div");
    list.className = "experience-list";
    for (const entry of experiences) {
      const card = makeRouteLink(entry.title, { kind: "module", moduleId: entry.id }, "experience-card");
      const cardHeading = document.createElement("span");
      cardHeading.className = "experience-card-title";
      cardHeading.textContent = entry.title;
      if (entry.isDraft) {
        const badge = document.createElement("span");
        badge.className = "preview-badge";
        badge.textContent = "Preview";
        cardHeading.append(" ", badge);
      }
      const detail = document.createElement("span");
      detail.className = "experience-card-detail";
      detail.textContent = `${entry.estimatedMinutes} minutes`;
      const description = document.createElement("span");
      description.className = "experience-card-description";
      description.textContent = entry.description;
      card.replaceChildren(cardHeading, detail, description);
      list.append(card);
    }
    page.append(list);
  }
  app.replaceChildren(page);
}

async function mountModule(
  entry: CatalogueEntry,
  catalogue: readonly CatalogueEntry[],
  sequence: number,
): Promise<void> {
  const page = document.createElement("main");
  page.className = "module-page";
  const moduleRoot = document.createElement("div");
  moduleRoot.className = "module-mount";
  page.append(moduleRoot);
  app.replaceChildren(page);

  let disposeCameraView: (() => void) | null = null;
  let disposeExperienceMenu: (() => void) | null = null;
  let disposeModule: (() => void) | null = null;
  try {
    const [runtime, engineCore, cameraView] = await Promise.all([
      loadModuleRuntime(entry.id),
      import("@mma/engine-core"),
      import("./camera-view.js"),
    ]);
    if (sequence !== renderSequence) {
      return;
    }
    if (!runtime) {
      renderStart(await loadCatalogue(), "That experience was not found. Choose a subject to continue.");
      return;
    }
    const { manifest, mount } = runtime;
    if (manifest.id !== entry.id || manifest.modes[0] !== "screen") {
      throw new Error("This experience is not available in screen mode.");
    }
    disposeModule = mount(moduleRoot, { diagnostics: import.meta.env.DEV });
    const builderHeader = moduleRoot.querySelector<HTMLElement>(".builder-header");
    const sceneHost = moduleRoot.querySelector<HTMLElement>(".scene-viewport");
    if (!builderHeader || !sceneHost) {
      throw new Error("The experience could not find its screen scene.");
    }
    const backLink = makeRouteLink(
      "Back",
      { kind: "subject", subject: entry.subject },
      "module-back",
    );
    backLink.setAttribute("aria-label", `Back to ${subjectTitle(entry.subject)}`);
    builderHeader.prepend(backLink);
    disposeExperienceMenu = mountExperienceMenu({
      header: builderHeader,
      current: entry,
      catalogue,
    });

    const idGenerator = engineCore.createIdGenerator({
      crypto: globalThis.crypto,
      now: Date.now,
    });
    disposeCameraView = cameraView.mountCameraView({
      root: moduleRoot,
      sceneHost,
      telemetryContext: {
        studentRef: idGenerator(),
        sessionId: idGenerator(),
        moduleId: manifest.id,
        moduleVersion: "0.0.0",
        device: { mode: "screen", tier: "mid" },
      },
      clock: () => new Date().toISOString(),
      idGenerator,
      diagnostics: import.meta.env.DEV,
    });
    moduleTeardown = () => {
      disposeCameraView?.();
      disposeExperienceMenu?.();
      disposeModule?.();
    };
  } catch (error) {
    disposeCameraView?.();
    disposeExperienceMenu?.();
    disposeModule?.();
    if (sequence === renderSequence) {
      showLoadError(error);
    }
  }
}

function leaveCurrentModule(): void {
  const teardown = moduleTeardown;
  moduleTeardown = null;
  teardown?.();
}

function makeRouteLink(label: string, route: AppRoute, className: string): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = className;
  link.href = buildRoute(route, window.location.href);
  link.textContent = label;
  return link;
}

function subjectTitle(subjectId: SubjectId): string {
  return subjects.find(({ id }) => id === subjectId)?.title ?? "subject";
}

function buildDevToolUrl(tool: "gallery" | "narration-generator"): string {
  const url = new URL(window.location.href);
  url.searchParams.delete("gallery");
  url.searchParams.delete("visual-gallery");
  url.searchParams.delete("narration-generator");
  url.searchParams.set(tool, "");
  url.hash = "";
  return url.toString();
}

function showLoadError(error: unknown): void {
  app.replaceChildren();
  const message = document.createElement("p");
  message.className = "shell-error";
  message.setAttribute("role", "alert");
  message.textContent = error instanceof Error ? error.message : "The page could not be loaded.";
  app.append(message);
}