"use client";

import { useMemo, useState } from "react";

export interface Driver {
  registrationId: string;
  startNumber: number | null;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  teamId?: string | null;
  teamName?: string | null;
}

function flagFor(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const cps = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65
  );
  return String.fromCodePoint(...cps);
}

export function InvolvedDriversPicker({
  drivers,
  excludeRegistrationId,
  name = "involvedRegistrationIds",
  teamMode = false,
}: {
  drivers: Driver[];
  excludeRegistrationId?: string;
  name?: string;
  teamMode?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => d.registrationId !== excludeRegistrationId)
      .filter((d) => {
        if (!q) return true;
        const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase();
        const num = d.startNumber != null ? String(d.startNumber) : "";
        const team = (d.teamName ?? "").toLowerCase();
        return name.includes(q) || num.includes(q) || team.includes(q);
      })
      .sort((a, b) => {
        if (teamMode) {
          const at = a.teamName ?? "~";
          const bt = b.teamName ?? "~";
          const tcmp = at.localeCompare(bt);
          if (tcmp !== 0) return tcmp;
        }
        const an = a.startNumber ?? 9999;
        const bn = b.startNumber ?? 9999;
        if (an !== bn) return an - bn;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }, [drivers, query, excludeRegistrationId, teamMode]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group by team when teamMode is on
  const grouped = useMemo(() => {
    if (!teamMode) return null;
    const map = new Map<string, Driver[]>();
    for (const d of visible) {
      const key = d.teamName ?? "(No team)";
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return [...map.entries()];
  }, [teamMode, visible]);

  function renderRow(d: Driver) {
    const isOn = selected.has(d.registrationId);
    return (
      <li key={d.registrationId}>
        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={isOn}
            onChange={() => toggle(d.registrationId)}
            className="h-4 w-4 accent-orange-500"
          />
          {!teamMode && (
            <span className="w-10 text-right text-xs text-zinc-500">
              {d.startNumber != null ? `#${d.startNumber}` : "—"}
            </span>
          )}
          <span className="text-base">{flagFor(d.countryCode)}</span>
          <span className="flex-1 text-sm text-zinc-200">
            {d.firstName} {d.lastName}
          </span>
        </label>
      </li>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={
          teamMode
            ? "Search by team or driver name…"
            : "Search by name or start number…"
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">No drivers match.</p>
        ) : teamMode && grouped ? (
          <div className="divide-y divide-zinc-800">
            {grouped.map(([teamName, members]) => (
              <div key={teamName}>
                <div className="bg-zinc-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {teamName}
                </div>
                <ul>{members.map(renderRow)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">{visible.map(renderRow)}</ul>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {selected.size} driver{selected.size === 1 ? "" : "s"} selected
        {selected.size > 0 && " — they will be tagged as ACCUSED on the report."}
      </p>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
