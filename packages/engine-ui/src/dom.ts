/** Create an element with optional class names and text. */
export function el<Tag extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: Tag,
  className = "",
  text = "",
): HTMLElementTagNameMap[Tag] {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

/** Create a `type="button"` button that sends `command` through the page's click handler. */
export function commandButton(
  doc: Document,
  label: string,
  command: string,
  variant: "primary" | "secondary" | "quiet" | "option",
): HTMLButtonElement {
  const button = el(doc, "button", `mma-button mma-button--${variant}`, label);
  button.type = "button";
  button.dataset.command = command;
  return button;
}

/** Set text only when it changed, so screen readers do not re-announce live regions. */
export function setText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}
