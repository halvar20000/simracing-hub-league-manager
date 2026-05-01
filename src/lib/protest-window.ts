export type ProtestWindowStatus = "OPEN" | "CLOSED" | "UNLIMITED";

export interface ProtestWindowState {
  status: ProtestWindowStatus;
  closesAt: Date | null;
  minutesRemaining: number | null;
  windowHours: number | null;
}

export function protestWindowState(args: {
  raceStartsAt: Date;
  protestWindowHours: number | null | undefined;
  now?: Date;
}): ProtestWindowState {
  const now = args.now ?? new Date();
  const hours = args.protestWindowHours ?? null;

  if (hours == null) {
    return { status: "UNLIMITED", closesAt: null, minutesRemaining: null, windowHours: null };
  }

  const closesAt = new Date(args.raceStartsAt.getTime() + hours * 60 * 60 * 1000);
  const minutesRemaining = Math.round((closesAt.getTime() - now.getTime()) / 60000);

  return {
    status: minutesRemaining > 0 ? "OPEN" : "CLOSED",
    closesAt,
    minutesRemaining,
    windowHours: hours,
  };
}

export function formatCountdown(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h < 24) return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const hh = h % 24;
  return hh > 0 ? `${d}d ${hh}h` : `${d}d`;
}
