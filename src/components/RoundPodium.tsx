import React from "react";
import { CountryFlag } from "./CountryFlag";

type PodiumDriver = {
  rank: number; // 1, 2, 3
  firstName: string | null;
  lastName: string | null;
  startNumber: number | null;
  countryCode: string | null;
  teamName: string | null;
  carClassName: string | null;
  totalPoints: number;
  raceBreakdown?: { raceNumber: number; finishPosition: number }[];
};

export function RoundPodium({
  drivers,
  isMultiRace,
  isMulticlass,
}: {
  drivers: PodiumDriver[];
  isMultiRace: boolean;
  isMulticlass: boolean;
}) {
  if (drivers.length < 3) return null;
  // Render in ranking order on mobile (1, 2, 3); on >=sm we put 2 / 1 / 3 so
  // the winner sits in the middle with a slight elevation.
  const mobileOrder = drivers.slice(0, 3);
  return (
    <section>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {mobileOrder.map((d) => (
          <PodiumCard
            key={d.rank}
            driver={d}
            isMultiRace={isMultiRace}
            isMulticlass={isMulticlass}
          />
        ))}
      </div>
    </section>
  );
}

function PodiumCard({
  driver,
  isMultiRace,
  isMulticlass,
}: {
  driver: PodiumDriver;
  isMultiRace: boolean;
  isMulticlass: boolean;
}) {
  const r = driver.rank;
  const card =
    r === 1
      ? "border-yellow-500/60 bg-gradient-to-br from-yellow-950/40 to-zinc-950 sm:scale-[1.02] sm:order-2"
      : r === 2
        ? "border-zinc-500/50 bg-gradient-to-br from-zinc-800/40 to-zinc-950 sm:order-1"
        : "border-amber-700/50 bg-gradient-to-br from-amber-950/40 to-zinc-950 sm:order-3";
  const accent =
    r === 1 ? "text-yellow-300" : r === 2 ? "text-zinc-200" : "text-amber-400";
  const label = r === 1 ? "Winner" : r === 2 ? "2nd" : "3rd";

  const name = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();

  return (
    <div className={`relative overflow-hidden rounded-lg border p-4 ${card}`}>
      <div className="flex items-baseline justify-between">
        <span className={`font-display text-3xl font-bold ${accent}`}>
          P{r}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="mt-3">
        <div className="font-display text-base font-bold text-zinc-100">
          {driver.startNumber != null && (
            <span className={`mr-1.5 ${accent}`}>#{driver.startNumber}</span>
          )}
          <CountryFlag code={driver.countryCode} />
          {name || "—"}
        </div>
        <div className="mt-0.5 text-xs text-zinc-400">
          {driver.teamName ?? "Independent"}
          {isMulticlass && driver.carClassName ? ` • ${driver.carClassName}` : ""}
        </div>
      </div>
      <div className={`mt-3 font-display text-2xl font-bold ${accent}`}>
        {driver.totalPoints} <span className="text-sm font-normal text-zinc-400">pts</span>
      </div>
      {isMultiRace && driver.raceBreakdown && driver.raceBreakdown.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {driver.raceBreakdown.map((rb) => (
            <span
              key={rb.raceNumber}
              className="rounded bg-zinc-950/70 px-1.5 py-0.5 text-[10px] text-zinc-300"
            >
              R{rb.raceNumber}: P{rb.finishPosition}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
