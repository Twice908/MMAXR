/** An element supported by the Class 9-10 chemistry kit. */
export interface Element {
  readonly atomicNumber: number;
  readonly symbol: string;
  readonly name: string;
}

const elements: readonly Element[] = [
  { atomicNumber: 1, symbol: "H", name: "Hydrogen" },
  { atomicNumber: 2, symbol: "He", name: "Helium" },
  { atomicNumber: 3, symbol: "Li", name: "Lithium" },
  { atomicNumber: 4, symbol: "Be", name: "Beryllium" },
  { atomicNumber: 5, symbol: "B", name: "Boron" },
  { atomicNumber: 6, symbol: "C", name: "Carbon" },
  { atomicNumber: 7, symbol: "N", name: "Nitrogen" },
  { atomicNumber: 8, symbol: "O", name: "Oxygen" },
  { atomicNumber: 9, symbol: "F", name: "Fluorine" },
  { atomicNumber: 10, symbol: "Ne", name: "Neon" },
  { atomicNumber: 11, symbol: "Na", name: "Sodium" },
  { atomicNumber: 12, symbol: "Mg", name: "Magnesium" },
  { atomicNumber: 13, symbol: "Al", name: "Aluminium" },
  { atomicNumber: 14, symbol: "Si", name: "Silicon" },
  { atomicNumber: 15, symbol: "P", name: "Phosphorus" },
  { atomicNumber: 16, symbol: "S", name: "Sulfur" },
  { atomicNumber: 17, symbol: "Cl", name: "Chlorine" },
  { atomicNumber: 18, symbol: "Ar", name: "Argon" },
  { atomicNumber: 19, symbol: "K", name: "Potassium" },
  { atomicNumber: 20, symbol: "Ca", name: "Calcium" },
];

const elementsByNumber = new Map(elements.map((element) => [element.atomicNumber, element]));
const elementsBySymbol = new Map(
  elements.map((element) => [element.symbol.toLowerCase(), element]),
);

/** Look up a supported element by atomic number. */
export function elementByAtomicNumber(atomicNumber: number): Element | undefined {
  return elementsByNumber.get(atomicNumber);
}

/** Look up a supported element by symbol, without regard to letter case. */
export function elementBySymbol(symbol: string): Element | undefined {
  return elementsBySymbol.get(symbol.trim().toLowerCase());
}

/** Return the supported elements in atomic-number order. */
export function allElements(): readonly Element[] {
  return elements;
}