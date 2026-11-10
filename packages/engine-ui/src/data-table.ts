import { el, setText } from "./dom.js";

/** One column of a {@link createDataTable} table. */
export interface DataTableColumn {
  readonly key: string;
  /** Header text, with units, such as "Current I (A)". */
  readonly label: string;
  /** Numbers read best right-aligned. */
  readonly numeric?: boolean;
}

/** A mounted table. */
export interface DataTable {
  readonly element: HTMLElement;
  /** Replace the rows. Each row maps a column key to the text shown. */
  update(rows: readonly Readonly<Record<string, string>>[]): void;
}

/** Options for {@link createDataTable}. */
export interface DataTableOptions {
  /** Read by screen readers as the table's name. */
  readonly caption: string;
  readonly columns: readonly DataTableColumn[];
  /** Shown in place of rows while there are none. */
  readonly emptyText: string;
}

/**
 * Create a subject-neutral data table, such as a readings table. It scrolls sideways
 * on narrow screens instead of squeezing columns, and new rows are announced politely.
 */
export function createDataTable(options: DataTableOptions, doc: Document = document): DataTable {
  const element = el(doc, "div", "mma-table");
  const table = el(doc, "table", "mma-table__table");
  const caption = el(doc, "caption", "mma-visually-hidden", options.caption);
  const head = el(doc, "thead");
  const headRow = el(doc, "tr");
  for (const column of options.columns) {
    const cell = el(doc, "th", column.numeric ? "is-numeric" : "", column.label);
    cell.scope = "col";
    headRow.append(cell);
  }
  head.append(headRow);
  const body = el(doc, "tbody");
  table.append(caption, head, body);
  const empty = el(doc, "p", "mma-table__empty", options.emptyText);
  const status = el(doc, "p", "mma-visually-hidden");
  status.setAttribute("role", "status");
  element.append(table, empty, status);

  let rowCount = 0;
  const update = (rows: readonly Readonly<Record<string, string>>[]): void => {
    body.replaceChildren(...rows.map((row) => {
      const tr = el(doc, "tr");
      for (const column of options.columns) tr.append(el(doc, "td", column.numeric ? "is-numeric" : "", row[column.key] ?? ""));
      return tr;
    }));
    empty.hidden = rows.length > 0;
    table.hidden = rows.length === 0;
    if (rows.length > rowCount) setText(status, `${rows.length} row${rows.length === 1 ? "" : "s"} in the table.`);
    rowCount = rows.length;
  };
  update([]);
  return { element, update };
}
