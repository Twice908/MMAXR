import { el } from "./dom.js";

/** Marker shapes, so series differ by shape as well as colour. */
export type GraphMarker = "circle" | "square" | "triangle" | "diamond";

/** One set of points drawn with the same colour and marker. */
export interface GraphSeries {
  readonly id: string;
  readonly label: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly marker: GraphMarker;
  /** Colour slot 0-3 from the shared palette. */
  readonly tone: number;
  /** Join the points (sorted by x) with a line that starts at the origin. */
  readonly joinFromOrigin: boolean;
}

/** Everything the graph shows. */
export interface GraphData {
  readonly series: readonly GraphSeries[];
  /** Smallest axis ends, so the axes do not jump while the first points arrive. */
  readonly minXMax?: number;
  readonly minYMax?: number;
}

/** Axis ticks and the scale from data units to pixels. Pure, for testing. */
export interface GraphGeometry {
  readonly xTicks: readonly number[];
  readonly yTicks: readonly number[];
  readonly xMax: number;
  readonly yMax: number;
  /** Data point to SVG pixels inside the plot box. */
  toPixel(x: number, y: number): { readonly x: number; readonly y: number };
}

/** Plot box inside the SVG view box, in pixels. */
export const GRAPH_BOX = { width: 340, height: 260, left: 56, top: 12, right: 12, bottom: 44 } as const;

/**
 * Round tick values from 0 up to at least `max`, about `count` steps, using steps of
 * 1, 2 or 5 × a power of ten (0, 0.1, 0.2, ... or 0, 2, 4, ...).
 */
export function niceTicks(max: number, count = 5): readonly number[] {
  const top = max > 0 && Number.isFinite(max) ? max : 1;
  const rough = top / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? 10 * power);
  const steps = Math.max(1, Math.ceil(top / step - 1e-9));
  return Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}

/** Work out ticks and scale for the data. */
export function buildGraphGeometry(data: GraphData): GraphGeometry {
  let xMax = data.minXMax ?? 0;
  let yMax = data.minYMax ?? 0;
  for (const series of data.series) {
    for (const point of series.points) {
      xMax = Math.max(xMax, point.x);
      yMax = Math.max(yMax, point.y);
    }
  }
  const xTicks = niceTicks(xMax);
  const yTicks = niceTicks(yMax);
  const xEnd = xTicks.at(-1) ?? 1;
  const yEnd = yTicks.at(-1) ?? 1;
  const plotWidth = GRAPH_BOX.width - GRAPH_BOX.left - GRAPH_BOX.right;
  const plotHeight = GRAPH_BOX.height - GRAPH_BOX.top - GRAPH_BOX.bottom;
  return {
    xTicks,
    yTicks,
    xMax: xEnd,
    yMax: yEnd,
    toPixel: (x, y) => ({
      x: GRAPH_BOX.left + (x / xEnd) * plotWidth,
      y: GRAPH_BOX.top + plotHeight - (y / yEnd) * plotHeight,
    }),
  };
}

/** A mounted graph. */
export interface XyGraph {
  readonly element: HTMLElement;
  update(data: GraphData): void;
}

/** Options for {@link createXyGraph}. */
export interface XyGraphOptions {
  readonly title: string;
  /** Axis titles with units, such as "Current I (A)". */
  readonly xLabel: string;
  readonly yLabel: string;
  /** Shown over the empty plot before any points arrive. */
  readonly emptyText: string;
}

const SVG = "http://www.w3.org/2000/svg";

/**
 * Create a subject-neutral line-and-point graph (SVG). Series differ by colour and
 * marker shape, and are named in a legend; the SVG has a text summary for screen
 * readers, and the data should also be shown in a table.
 */
export function createXyGraph(options: XyGraphOptions, doc: Document = document): XyGraph {
  const element = el(doc, "figure", "mma-graph");
  const caption = el(doc, "figcaption", "mma-graph__title", options.title);
  const svg = doc.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", `0 0 ${GRAPH_BOX.width} ${GRAPH_BOX.height}`);
  svg.setAttribute("role", "img");
  svg.classList.add("mma-graph__plot");
  const legend = el(doc, "ul", "mma-graph__legend");
  const empty = el(doc, "p", "mma-graph__empty", options.emptyText);
  element.append(caption, svg, empty, legend);

  const node = (tag: string, attributes: Record<string, string | number>, className = ""): SVGElement => {
    const item = doc.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, String(value));
    if (className) item.setAttribute("class", className);
    return item;
  };

  const update = (data: GraphData): void => {
    const geometry = buildGraphGeometry(data);
    const children: SVGElement[] = [];
    const origin = geometry.toPixel(0, 0);
    const end = geometry.toPixel(geometry.xMax, geometry.yMax);
    for (const tick of geometry.xTicks) {
      const { x } = geometry.toPixel(tick, 0);
      children.push(node("line", { x1: x, x2: x, y1: end.y, y2: origin.y }, "mma-graph__grid"));
      const label = node("text", { x, y: origin.y + 16, "text-anchor": "middle" }, "mma-graph__tick");
      label.textContent = formatTick(tick);
      children.push(label);
    }
    for (const tick of geometry.yTicks) {
      const { y } = geometry.toPixel(0, tick);
      children.push(node("line", { x1: origin.x, x2: end.x, y1: y, y2: y }, "mma-graph__grid"));
      const label = node("text", { x: origin.x - 6, y: y + 4, "text-anchor": "end" }, "mma-graph__tick");
      label.textContent = formatTick(tick);
      children.push(label);
    }
    children.push(node("line", { x1: origin.x, x2: end.x, y1: origin.y, y2: origin.y }, "mma-graph__axis"));
    children.push(node("line", { x1: origin.x, x2: origin.x, y1: origin.y, y2: end.y }, "mma-graph__axis"));
    const xTitle = node("text", { x: (origin.x + end.x) / 2, y: GRAPH_BOX.height - 6, "text-anchor": "middle" }, "mma-graph__axis-title");
    xTitle.textContent = options.xLabel;
    const yTitle = node(
      "text",
      { x: 0, y: 0, "text-anchor": "middle", transform: `translate(14 ${(origin.y + end.y) / 2}) rotate(-90)` },
      "mma-graph__axis-title",
    );
    yTitle.textContent = options.yLabel;
    children.push(xTitle, yTitle);

    for (const series of data.series) {
      const tone = `mma-graph__series--${Math.abs(series.tone) % 4}`;
      const points = [...series.points].sort((a, b) => a.x - b.x);
      if (series.joinFromOrigin && points.length > 0) {
        const line = [{ x: 0, y: 0 }, ...points].map((point) => geometry.toPixel(point.x, point.y));
        children.push(node("polyline", { points: line.map((p) => `${p.x},${p.y}`).join(" ") }, `mma-graph__line ${tone}`));
      }
      for (const point of points) children.push(marker(series.marker, geometry.toPixel(point.x, point.y), tone));
    }
    svg.replaceChildren(...children);

    const withPoints = data.series.filter((series) => series.points.length > 0);
    empty.hidden = withPoints.length > 0;
    svg.setAttribute("aria-label", graphSummary(options, data));
    legend.replaceChildren(...withPoints.map((series) => {
      const item = el(doc, "li", "mma-graph__key");
      const swatch = doc.createElementNS(SVG, "svg");
      swatch.setAttribute("viewBox", "0 0 16 16");
      swatch.setAttribute("aria-hidden", "true");
      swatch.classList.add("mma-graph__swatch");
      swatch.append(marker(series.marker, { x: 8, y: 8 }, `mma-graph__series--${Math.abs(series.tone) % 4}`));
      item.append(swatch, doc.createTextNode(series.label));
      return item;
    }));
  };

  const marker = (shape: GraphMarker, at: { x: number; y: number }, tone: string): SVGElement => {
    const size = 5;
    const className = `mma-graph__marker ${tone}`;
    switch (shape) {
      case "square":
        return node("rect", { x: at.x - size, y: at.y - size, width: size * 2, height: size * 2 }, className);
      case "triangle":
        return node("polygon", { points: `${at.x},${at.y - size - 1} ${at.x + size + 1},${at.y + size} ${at.x - size - 1},${at.y + size}` }, className);
      case "diamond":
        return node("polygon", { points: `${at.x},${at.y - size - 1} ${at.x + size + 1},${at.y} ${at.x},${at.y + size + 1} ${at.x - size - 1},${at.y}` }, className);
      case "circle":
        return node("circle", { cx: at.x, cy: at.y, r: size }, className);
    }
  };

  update({ series: [] });
  return { element, update };
}

/** Text summary of the graph for screen readers. */
export function graphSummary(options: Pick<XyGraphOptions, "title" | "xLabel" | "yLabel" | "emptyText">, data: GraphData): string {
  const withPoints = data.series.filter((series) => series.points.length > 0);
  if (withPoints.length === 0) return `${options.title}. ${options.emptyText}`;
  const parts = withPoints.map((series) => `${series.label}: ${series.points.length} point${series.points.length === 1 ? "" : "s"}`);
  return `${options.title}, ${options.yLabel} against ${options.xLabel}. ${parts.join("; ")}.`;
}

function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
