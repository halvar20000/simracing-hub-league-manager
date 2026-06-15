"use client";

import { useEffect } from "react";

/**
 * Group-aware Excel-like sort + per-column filter for a server-rendered
 * `<table>` whose body rows are grouped (e.g. drivers grouped under their
 * team on the IEC roster).
 *
 * Conventions (a superset of SortableTableEnhancer's):
 *  1. Each sortable / filterable `<th>` carries `data-col="<key>"`.
 *  2. Each body `<tr>` carries `data-group="<groupId>"` and a
 *     `data-r-<key>="<sortable value>"` for every column key.
 *  3. Cells that belong to the GROUP header (shown once per contiguous
 *     block — e.g. the Registered date and the Team name/controls) wrap
 *     their content in an element with class `cw-group-cell`. The
 *     enhancer shows that content only on the first VISIBLE row of each
 *     contiguous group and hides it on continuation rows.
 *  4. The server pre-renders `cw-group-start` on each group's first row
 *     and `cw-group-cont` on the rest (so it looks grouped before JS
 *     hydrates); the enhancer recomputes these on every sort/filter.
 *
 * Sorting:
 *  - Clicking a `groupCols` header (default: Registered / Team) reorders
 *    whole team blocks, keeping each team's drivers together in their
 *    original order.
 *  - Clicking any other column sorts drivers WITHIN each team, leaving the
 *    team order untouched.
 *  - A third click clears the sort and restores the original order.
 *
 * Rows are only moved (appendChild), never re-rendered, so server-action
 * `<form>` submit handlers inside cells stay bound.
 */
export function SortableGroupedTableEnhancer({
  tableId,
  groupCols = ["registered", "team"],
}: {
  tableId: string;
  groupCols?: string[];
}) {
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
    const groupColSet = new Set(groupCols);

    // Capture the original row order once — the base for "no sort" and for
    // keeping each group's intra-order stable.
    const originalRows = Array.from(tbody.rows);

    type Sort = { col: string; dir: 1 | -1 };
    let sort: Sort | null = null;
    const filters = new Map<string, string>();

    // Inject the per-column filter row (idempotent).
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
          input.addEventListener("click", (e) => e.stopPropagation());
          newCell.appendChild(input);
        }
        filterRow.appendChild(newCell);
      }
    }

    // Sort handlers + indicator span per data-col header.
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

    const cmpVals = (av: string, bv: string, dir: 1 | -1): number => {
      // Empty values always sort to the end, regardless of direction — so the
      // empty-handling must NOT be multiplied by dir.
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      if (!av && !bv) return 0;
      // Numeric only when the WHOLE string parses as a number — Number()
      // (unlike parseFloat) rejects "2026-01-10", so ISO dates fall through
      // to a locale compare that orders them chronologically.
      const aN = Number(av);
      const bN = Number(bv);
      const numeric = !isNaN(aN) && !isNaN(bN);
      const cmp = numeric
        ? aN - bN
        : av.localeCompare(bv, undefined, { numeric: true });
      return dir * cmp;
    };

    const applyState = () => {
      // 1. Per-column filter.
      for (const r of originalRows) {
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

      // 2. Sort indicators.
      for (const th of headers) {
        const col = th.getAttribute("data-col")!;
        const ind = th.querySelector<HTMLSpanElement>(".cw-sort-ind");
        if (!ind) continue;
        if (sort && sort.col === col) {
          ind.textContent = sort.dir === 1 ? "▲" : "▼";
          ind.style.color = "#f97316";
        } else {
          ind.textContent = "";
          ind.style.color = "";
        }
      }

      // 3. Group rows in original order.
      const groupOrder: string[] = [];
      const groups = new Map<string, HTMLTableRowElement[]>();
      for (const r of originalRows) {
        const g = r.getAttribute("data-group") ?? "";
        if (!groups.has(g)) {
          groups.set(g, []);
          groupOrder.push(g);
        }
        groups.get(g)!.push(r);
      }

      // 4. Compute the new row order.
      let order: HTMLTableRowElement[];
      if (!sort) {
        order = originalRows;
      } else if (groupColSet.has(sort.col)) {
        const s = sort;
        const sortedGroups = [...groupOrder].sort((ga, gb) => {
          const av = groups.get(ga)![0].getAttribute(`data-r-${s.col}`) ?? "";
          const bv = groups.get(gb)![0].getAttribute(`data-r-${s.col}`) ?? "";
          return cmpVals(av, bv, s.dir);
        });
        order = sortedGroups.flatMap((g) => groups.get(g)!);
      } else {
        const s = sort;
        order = groupOrder.flatMap((g) => {
          const rows = [...groups.get(g)!];
          rows.sort((a, b) =>
            cmpVals(
              a.getAttribute(`data-r-${s.col}`) ?? "",
              b.getAttribute(`data-r-${s.col}`) ?? "",
              s.dir
            )
          );
          return rows;
        });
      }
      for (const r of order) tbody.appendChild(r);

      // 5. Recompute group-start / continuation markers over VISIBLE rows so
      //    the team header (name + controls) always rides the top of each
      //    contiguous block, even after a within-team sort or a filter.
      let prevGroup: string | null = null;
      for (const r of order) {
        if (r.classList.contains("cw-col-hidden")) continue;
        const g = r.getAttribute("data-group") ?? "";
        if (g !== prevGroup) {
          r.classList.add("cw-group-start");
          r.classList.remove("cw-group-cont");
          prevGroup = g;
        } else {
          r.classList.add("cw-group-cont");
          r.classList.remove("cw-group-start");
        }
      }
    };

    applyState();
  }, [tableId, groupCols]);

  return (
    <style>{`
      .cw-col-hidden { display: none !important; }
      tr.cw-group-cont .cw-group-cell { display: none; }
      tr.cw-group-start > td { border-top: 2px solid rgb(63 63 70); }
      tr.cw-group-start { background-color: rgba(9, 9, 11, 0.4); }
      tr.cw-group-cont > td { border-top: 1px solid rgb(39 39 42); }
    `}</style>
  );
}
