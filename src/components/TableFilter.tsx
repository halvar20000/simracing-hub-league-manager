"use client";

import { useState } from "react";

/**
 * Drop-in search box for any server-rendered admin table.
 *
 * Usage:
 *   <TableFilter tableId="rosterTable" placeholder="Filter drivers…" />
 *   <table id="rosterTable">
 *     <tbody>
 *       <tr data-filter="thomas herbrig 912856 cas tech 968 ferrari pro">
 *         ...
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * It renders an <input> and a tiny <style> tag. The style hides every
 * <tr data-filter="..."> whose attribute does NOT contain the query
 * (case-insensitive). No DOM manipulation — React stays in charge.
 */
export default function TableFilter({
  tableId,
  placeholder = "Filter…",
  className = "",
}: {
  tableId: string;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const query = q.trim();

  // Escape characters that would break the CSS attribute selector.
  // Double quotes and backslashes are the dangerous ones.
  const safe = query.replace(/[\\"]/g, (m) => `\\${m}`);

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full max-w-sm rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500"
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
          >
            Clear
          </button>
        )}
      </div>
      {query.length > 0 && (
        <style>{`#${tableId} tbody tr[data-filter]:not([data-filter*="${safe}" i]) { display: none; }`}</style>
      )}
    </>
  );
}
