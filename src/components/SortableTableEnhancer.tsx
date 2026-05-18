"use client";

import { useEffect } from "react";

/**
 * Excel-like sort + per-column filter for a server-rendered `<table>`.
 *
 * The table is rendered normally on the server, with two conventions:
 *
 *  1. Each sortable / filterable `<th>` carries `data-col="<key>"`.
 *  2. Each `<tr>` in the body carries `data-r-<key>="<value>"` for each
 *     column key. The value is the *sortable / filterable* form
 *     (lowercased / numeric / etc. as makes sense for that column).
 *
 * On mount this component:
 *  - Injects a filter row of `<input>` elements into the table's
 *    `<thead>` (one input per data-col column).
 *  - Makes each data-col header clickable: cycles asc → desc → none
 *    with an ▲ / ▼ indicator.
 *  - On any filter / sort change, toggles a `.cw-col-hidden` class on
 *    non-matching rows (composes safely with the existing
 *    `TableFilter`'s CSS attribute selector — !important wins).
 *  - Reorders `<tr>` children of `<tbody>` in place when sort is
 *    active. Form actions and server-action `<form>` elements inside
 *    cells are NOT re-rendered, just moved, so submit handlers stay
 *    bound.
 *
 * The component itself renders only a `<style>` block declaring the
 * `.cw-col-hidden` rule — no visible UI.
 */
export function SortableTableEnhancer({ tableId }: { tableId: string }) {
  useEffect(() => {
    const table = document.getElementById(tableId) as HTMLTableElement | null;
    if (!table) return;
    const thead = table.tHead;
    const tbody = table.tBodies[0];
    if (!thead || !tbody) return;

    const headerRow = thead.rows[0];
    if (!headerRow) return;
    const headers = Array.from(headerRow.cells).filter((c) =>
      c.getAttribute("data-col")
    );
    if (headers.length === 0) return;

    type Sort = { col: string; dir: 1 | -1 };
    let sort: Sort | null = null;
    const filters = new Map<string, string>();

    // Inject the filter row (idempotent: skip if React happened to
    // re-mount us and it's already there).
    let filterRow = thead.querySelector<HTMLTableRowElement>("tr.cw-filter-row");
    if (!filterRow) {
      filterRow = thead.insertRow();
      filterRow.classList.add("cw-filter-row");
      for (const cell of Array.from(headerRow.cells)) {
        const newCell = document.createElement("th");
        newCell.className = "px-2 pb-2 font-normal";
        const col = cell.getAttribute("data-col");
        if (col) {
          const input = document.createElement("input");
          input.type = "text";
          input.placeholder = "Filter…";
          input.className =
            "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-[11px] text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none";
          input.addEventListener("input", () => {
            const q = input.value.trim().toLowerCase();
            if (q) filters.set(col, q);
            else filters.delete(col);
            applyState();
          });
          // Clicks inside the filter input shouldn't bubble up and
          // trigger the sort handler on the header.
          input.addEventListener("click", (e) => e.stopPropagation());
          newCell.appendChild(input);
        }
        filterRow.appendChild(newCell);
      }
    }

    // Add sort handlers + indicator span to each data-col header.
    for (const th of headers) {
      const col = th.getAttribute("data-col")!;

      let ind = th.querySelector<HTMLSpanElement>(".cw-sort-ind");
      if (!ind) {
        ind = document.createElement("span");
        ind.className = "cw-sort-ind ml-1 inline-block w-3 text-xs";
        th.appendChild(ind);
      }
      th.style.cursor = "pointer";
      th.style.userSelect = "none";
      th.addEventListener("click", () => {
        if (!sort || sort.col !== col) sort = { col, dir: 1 };
        else if (sort.dir === 1) sort = { col, dir: -1 };
        else sort = null;
        applyState();
      });
    }

    const applyState = () => {
      const rows = Array.from(tbody.rows);

      // Per-column filter via class toggle.
      for (const r of rows) {
        let hide = false;
        for (const [col, q] of filters) {
          const v = (r.getAttribute(`data-r-${col}`) ?? "").toLowerCase();
          if (!v.includes(q)) {
            hide = true;
            break;
          }
        }
        r.classList.toggle("cw-col-hidden", hide);
      }

      // Sort indicators.
      for (const th of headers) {
        const col = th.getAttribute("data-col")!;
        const ind = th.querySelector<HTMLSpanElement>(".cw-sort-ind");
        if (!ind) continue;
        if (sort && sort.col === col) {
          ind.textContent = sort.dir === 1 ? "▲" : "▼";
          ind.style.color = "#f97316"; // orange-500
        } else {
          ind.textContent = "";
          ind.style.color = "";
        }
      }

      // Sort: reorder <tr> children of tbody. Numeric if both sides
      // parse cleanly, otherwise locale-compare (with numeric option
      // so "10" sorts after "2" in mixed strings like "R10" / "R2").
      if (sort) {
        const sCol = sort.col;
        const dir = sort.dir;
        const sorted = [...rows].sort((a, b) => {
          const av = a.getAttribute(`data-r-${sCol}`) ?? "";
          const bv = b.getAttribute(`data-r-${sCol}`) ?? "";
          const aN = parseFloat(av);
          const bN = parseFloat(bv);
          const numeric =
            av !== "" && bv !== "" && !isNaN(aN) && !isNaN(bN);
          // Push empty-strings to the end regardless of dir.
          if (!av && bv) return 1;
          if (av && !bv) return -1;
          const cmp = numeric
            ? aN - bN
            : av.localeCompare(bv, undefined, { numeric: true });
          return dir * cmp;
        });
        for (const r of sorted) tbody.appendChild(r);
      }
    };
  }, [tableId]);

  // .cw-col-hidden wins against the existing TableFilter CSS hide too
  // — !important is enough since the global rule isn't !important.
  return <style>{`.cw-col-hidden { display: none !important; }`}</style>;
}
