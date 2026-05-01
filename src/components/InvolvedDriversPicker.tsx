"use client";

import { useMemo, useState } from "react";

interface Driver {
  registrationId: string;
  startNumber: number | null;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
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
}: {
  drivers: Driver[];
  excludeRegistrationId?: string;
  name?: string;
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
        return name.includes(q) || num.includes(q);
      })
      .sort((a, b) => {
        const an = a.startNumber ?? 9999;
        const bn = b.startNumber ?? 9999;
        if (an !== bn) return an - bn;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }, [drivers, query, excludeRegistrationId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder="Search by name or start number…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">No drivers match.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {visible.map((d) => {
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
                    <span className="w-10 text-right text-xs text-zinc-500">
                      {d.startNumber != null ? `#${d.startNumber}` : "—"}
                    </span>
                    <span className="text-base">{flagFor(d.countryCode)}</span>
                    <span className="flex-1 text-sm text-zinc-200">
                      {d.firstName} {d.lastName}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {selected.size} driver{selected.size === 1 ? "" : "s"} selected
        {selected.size > 0 && " — they will be tagged as ACCUSED on the report."}
      </p>
      {/* Hidden inputs carry the selection to the server action */}
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
