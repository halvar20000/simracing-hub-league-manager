"use client";

/**
 * "Download CSV (filtered)" + "Print / Save as PDF (filtered)" buttons
 * for the roster pages. Both respect any active filters (global
 * TableFilter and per-column SortableTableEnhancer inputs) and the
 * current sort order because they operate on the DOM directly:
 *
 *  - CSV: walks <tbody> rows of #<tableId>, skips any row whose
 *    computed `display` is "none" (i.e. hidden by either filter), then
 *    reads `data-r-<col>` attributes for each column in the order the
 *    server rendered them. Extra columns (e.g. email on admin pages)
 *    can be appended via the `extraColumns` prop, each driven by an
 *    arbitrary `data-*` attribute on the row.
 *  - PDF: just `window.print()` on the current page. The roster pages
 *    have a `@media print` block that hides chrome (nav, header,
 *    filter inputs, action buttons) and switches the table to a
 *    light theme so the printed/PDF output is clean — and because the
 *    filtered rows already have `display: none`, the print only
 *    includes visible rows.
 *
 * Header labels are taken from the visible `<th>` text (with ▲/▼ sort
 * indicators stripped). Column order follows DOM order.
 */
export interface ExtraColumn {
  /** Header label in the CSV. */
  label: string;
  /** HTML attribute on each `<tr>` to read the value from. */
  attr: string;
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function FilteredRosterButtons({
  tableId,
  filenameBase,
  extraColumns = [],
}: {
  tableId: string;
  filenameBase: string;
  extraColumns?: ExtraColumn[];
}) {
  const downloadCsv = () => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return;
    const headRow = table.tHead?.rows[0];
    const tbody = table.tBodies[0];
    if (!headRow || !tbody) return;

    // Sortable / data-bound columns, in DOM order.
    const cols = Array.from(headRow.cells)
      .filter((th) => th.hasAttribute("data-col"))
      .map((th) => ({
        key: th.getAttribute("data-col")!,
        label: (th.textContent ?? "")
          // strip the SortableTableEnhancer's ▲/▼ indicator from the
          // header label so the CSV column heading is clean.
          .replace(/[▲▼]/g, "")
          .trim(),
      }));

    // Filtered set: rows currently visible. Both filter mechanisms
    // (global TableFilter CSS + .cw-col-hidden) result in
    // computed `display === "none"` for hidden rows.
    const rows = Array.from(tbody.rows).filter(
      (r) => window.getComputedStyle(r).display !== "none"
    );

    const header = [
      ...cols.map((c) => c.label),
      ...extraColumns.map((e) => e.label),
    ]
      .map(csvEscape)
      .join(",");

    const dataLines = rows.map((r) =>
      [
        ...cols.map((c) => r.getAttribute(`data-r-${c.key}`) ?? ""),
        ...extraColumns.map((e) => r.getAttribute(e.attr) ?? ""),
      ]
        .map(csvEscape)
        .join(",")
    );

    // UTF-8 BOM so Excel auto-detects encoding.
    const csv = "﻿" + [header, ...dataLines].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    window.print();
  };

  return (
    <div className="flex flex-wrap gap-2 no-print">
      <button
        type="button"
        onClick={downloadCsv}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Comma-separated values of the currently visible rows. Opens in Google Sheets, Excel, Numbers."
      >
        Download CSV
      </button>
      <button
        type="button"
        onClick={print}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Browser print dialog → Save as PDF. Only the currently visible rows are printed."
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
