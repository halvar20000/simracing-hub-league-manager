"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteSeason } from "@/lib/actions/seasons";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete season permanently"}
    </button>
  );
}

export function DeleteSeasonButton({
  leagueSlug,
  seasonId,
  seasonName,
  seasonYear,
  roundCount,
  registrationCount,
  raceResultCount,
}: {
  leagueSlug: string;
  seasonId: string;
  seasonName: string;
  seasonYear: number;
  roundCount: number;
  registrationCount: number;
  raceResultCount: number;
}) {
  const expected = `${seasonName} ${seasonYear}`;
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === expected;

  return (
    <form
      action={deleteSeason.bind(null, leagueSlug, seasonId)}
      className="space-y-3"
    >
      <p className="text-sm text-zinc-300">
        This will permanently delete{" "}
        <span className="font-semibold text-white">{expected}</span>, including:
      </p>
      <ul className="list-disc pl-5 text-xs text-zinc-400">
        <li>
          <span className="font-semibold text-zinc-200">{roundCount}</span>{" "}
          round{roundCount === 1 ? "" : "s"} (with all{" "}
          <span className="font-semibold text-zinc-200">
            {raceResultCount}
          </span>{" "}
          race result{raceResultCount === 1 ? "" : "s"}, incident reports,
          decisions, RSVP responses and penalties)
        </li>
        <li>
          <span className="font-semibold text-zinc-200">
            {registrationCount}
          </span>{" "}
          registration{registrationCount === 1 ? "" : "s"} and all teams
          attached to this season
        </li>
        <li>All car classes and per-season cars defined under it</li>
      </ul>
      <p className="text-sm text-red-300 font-semibold">
        This cannot be undone.
      </p>
      <label className="block text-sm text-zinc-400">
        Type the season name (
        <span className="font-mono text-zinc-200">{expected}</span>) to
        confirm:
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
