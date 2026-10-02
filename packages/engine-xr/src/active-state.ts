export interface ArActiveClassTarget {
  readonly classList: Pick<DOMTokenList, "toggle">;
}

/** Apply or remove the shared AR overlay state from related document elements. */
export function setArActiveState(
  active: boolean,
  targets: readonly ArActiveClassTarget[],
): void {
  for (const target of targets) {
    target.classList.toggle("ar-active", active);
  }
}