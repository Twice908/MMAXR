type Attributes = Readonly<Record<string, string | boolean | undefined>>;
type Child = Node | string | null | undefined | false;

/**
 * Build an element. Strings become text nodes, never HTML, so typed names cannot inject markup.
 * `true` sets an empty attribute, `false` or `undefined` leaves it off.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  ...children: readonly Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? "" : value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/** First letter of a name, upper-cased, for the avatar circle. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : "?";
}
