"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteRound } from "@/lib/actions/rounds";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete round permanently"}
    </button>
  );
}

export function DeleteRoundButton({
  leagueSlug,
  seasonId,
  roundId,
  roundLabel,
  raceResultCount,
  incidentReportCount,
  rsvpCount,
  penaltyCount,
}: {
  leagueSlug: string;
  seasonId: string;
  roundId: string;
  /** Human-readable label, e.g. "Round 5 — Spa-Francorchamps". Used as
   * the confirmation phrase the admin must type. */
  roundLabel: string;
  raceResultCount: number;
  incidentReportCount: number;
  rsvpCount: number;
  penaltyCount: number;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === roundLabel;

  return (
    <form
      action={deleteRound.bind(null, leagueSlug, seasonId, roundId)}
      className="space-y-3"
    >
      <p className="text-sm text-zinc-300">
        This will permanently delete{" "}
        <span className="font-semibold text-white">{roundLabel}</span> and
        everything attached to it:
      </p>
      <ul className="list-disc pl-5 text-xs text-zinc-400">
        <li>
          <span className="font-semibold text-zinc-200">
            {raceResultCount}
          </span>{" "}
          race result{raceResultCount === 1 ? "" : "s"} (including team
          results and CSV imports)
        </li>
        <li>
          <span className="font-semibold text-zinc-200">
            {incidentReportCount}
          </span>{" "}
          incident report{incidentReportCount === 1 ? "" : "s"} (with
          their decisions, comments and evidence)
        </li>
        <li>
          <span className="font-semibold text-zinc-200">{rsvpCount}</span>{" "}
          driver RSVP{rsvpCount === 1 ? "" : "s"} + any Discord
          announcement message for the round
        </li>
        <li>
          <span className="font-semibold text-zinc-200">{penaltyCount}</span>{" "}
          penalt{penaltyCount === 1 ? "y" : "ies"} and FPR awards issued
          this round
        </li>
      </ul>
      <p className="text-sm text-red-300 font-semibold">
        This cannot be undone.
      </p>
      <label className="block text-sm text-zinc-400">
        Type the round label (
        <span className="font-mono text-zinc-200">{roundLabel}</span>) to
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
