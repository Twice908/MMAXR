import type { CatalogueEntry } from "./catalogue.js";
import { subjects } from "./catalogue.js";
import { buildRoute, type AppRoute } from "./routes.js";

export interface ExperienceMenuItem {
  readonly label: string;
  readonly route: AppRoute;
  readonly current: boolean;
}

export interface ExperienceMenuOptions {
  readonly header: HTMLElement;
  readonly current: CatalogueEntry;
  readonly catalogue: readonly CatalogueEntry[];
}

/** Project catalogue data into the navigation choices for the open experience. */
export function buildExperienceMenuItems(
  catalogue: readonly CatalogueEntry[],
  current: CatalogueEntry,
): readonly ExperienceMenuItem[] {
  const items: ExperienceMenuItem[] = [
    { label: "Start", route: { kind: "start" }, current: false },
    ...subjects.map(({ id, title }) => ({
      label: title,
      route: { kind: "subject" as const, subject: id },
      current: false,
    })),
  ];
  for (const entry of catalogue.filter(({ subject }) => subject === current.subject)) {
    items.push({
      label: entry.title,
      route: { kind: "module", moduleId: entry.id },
      current: entry.id === current.id,
    });
  }
  return items;
}

/** Mount an accessible, catalogue-driven navigation menu in the experience header. */
export function mountExperienceMenu(options: ExperienceMenuOptions): () => void {
  const { header, current, catalogue } = options;
  const wrapper = document.createElement("div");
  wrapper.className = "experience-menu";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "experience-menu-button";
  button.setAttribute("aria-label", "Menu");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "true");
  const icon = document.createElement("span");
  icon.className = "experience-menu-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "☰";
  const label = document.createElement("span");
  label.className = "experience-menu-label";
  label.textContent = current.title;
  button.append(icon, label);

  const panel = document.createElement("nav");
  panel.className = "experience-menu-panel";
  panel.setAttribute("aria-label", "Experience navigation");
  panel.hidden = true;
  for (const item of buildExperienceMenuItems(catalogue, current)) {
    const link = document.createElement("a");
    link.href = buildRoute(item.route, window.location.href);
    link.textContent = item.label;
    if (item.current) {
      link.classList.add("is-current");
      link.setAttribute("aria-current", "page");
    }
    panel.append(link);
  }
  wrapper.append(button, panel);
  header.prepend(wrapper);

  let focusTimer: number | null = null;
  const close = (deferFocus = false): void => {
    if (panel.hidden) {
      return;
    }
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (deferFocus) {
      focusTimer = window.setTimeout(() => {
        focusTimer = null;
        if (wrapper.isConnected) {
          button.focus();
        }
      }, 0);
    } else {
      button.focus();
    }
  };
  const open = (): void => {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    panel.querySelector<HTMLAnchorElement>("a")?.focus();
  };
  const onButtonClick = (): void => {
    if (panel.hidden) {
      open();
    } else {
      close();
    }
  };
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && !panel.hidden) {
      event.preventDefault();
      close();
    }
  };
  const onDocumentPointerdown = (event: PointerEvent): void => {
    if (!panel.hidden && event.target instanceof Node && !wrapper.contains(event.target)) {
      close(true);
    }
  };
  const onPanelClick = (event: MouseEvent): void => {
    if ((event.target as Element | null)?.closest("a")) {
      close();
    }
  };

  button.addEventListener("click", onButtonClick);
  panel.addEventListener("click", onPanelClick);
  document.addEventListener("keydown", onDocumentKeydown);
  document.addEventListener("pointerdown", onDocumentPointerdown);

  return () => {
    button.removeEventListener("click", onButtonClick);
    panel.removeEventListener("click", onPanelClick);
    document.removeEventListener("keydown", onDocumentKeydown);
    document.removeEventListener("pointerdown", onDocumentPointerdown);
    if (focusTimer !== null) {
      window.clearTimeout(focusTimer);
    }
    wrapper.remove();
  };
}
