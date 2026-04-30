"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteLeague } from "@/lib/actions/leagues";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete league permanently"}
    </button>
  );
}

export function DeleteLeagueButton({
  leagueId,
  leagueName,
  seasonCount,
}: {
  leagueId: string;
  leagueName: string;
  seasonCount: number;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === leagueName;

  return (
    <form action={deleteLeague.bind(null, leagueId)} className="space-y-3">
      <p className="text-sm text-zinc-300">
        This will permanently delete{" "}
        <span className="font-semibold text-white">{leagueName}</span> and all{" "}
        <span className="font-semibold text-white">{seasonCount}</span> season
        {seasonCount === 1 ? "" : "s"}, rounds, registrations and race results
        attached to it. <span className="font-semibold text-red-300">This cannot be undone.</span>
      </p>
      <label className="block text-sm text-zinc-400">
        Type the league name (<span className="font-mono text-zinc-200">{leagueName}</span>) to confirm:
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none"
          autoComplete="off"
        />
      </label>
      <SubmitButton disabled={!matches} />
    </form>
  );
}
