export type ProtestWindowStatus = "COOLDOWN" | "OPEN" | "CLOSED" | "UNLIMITED";

export interface ProtestWindowState {
  status: ProtestWindowStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  /** When status === "COOLDOWN", minutes until the window opens. */
  minutesUntilOpen: number | null;
  /** When status === "OPEN" with a finite window, minutes left. */
  minutesRemaining: number | null;
  cooldownHours: number | null;
  windowHours: number | null;
}

/**
 * Reporting window timeline:
 *   raceStartsAt
 *     └── COOLDOWN (cooldownHours, optional) — no reports allowed
 *           └── OPEN (windowHours, optional) — reports allowed
 *                 └── CLOSED — no more reports
 *
 *   - Both null → UNLIMITED (always open).
 *   - Only cooldown set → cooldown then OPEN forever.
 *   - Only window set → OPEN immediately, then CLOSED.
 *   - Both set → cooldown then OPEN for N hours then CLOSED.
 */
export function protestWindowState(args: {
  raceStartsAt: Date;
  protestCooldownHours: number | null | undefined;
  protestWindowHours: number | null | undefined;
  now?: Date;
}): ProtestWindowState {
  const now = args.now ?? new Date();
  const cooldownHours = args.protestCooldownHours ?? null;
  const windowHours = args.protestWindowHours ?? null;

  if (cooldownHours == null && windowHours == null) {
    return {
      status: "UNLIMITED",
      opensAt: null,
      closesAt: null,
      minutesUntilOpen: null,
      minutesRemaining: null,
      cooldownHours: null,
      windowHours: null,
    };
  }

  const opensAt = new Date(
    args.raceStartsAt.getTime() + (cooldownHours ?? 0) * 60 * 60 * 1000
  );
  const closesAt =
    windowHours != null
      ? new Date(opensAt.getTime() + windowHours * 60 * 60 * 1000)
      : null;

  const minutesUntilOpen = Math.round((opensAt.getTime() - now.getTime()) / 60000);
  const minutesRemaining = closesAt
    ? Math.round((closesAt.getTime() - now.getTime()) / 60000)
    : null;

  if (minutesUntilOpen > 0) {
    return {
      status: "COOLDOWN",
      opensAt,
      closesAt,
      minutesUntilOpen,
      minutesRemaining: null,
      cooldownHours,
      windowHours,
    };
  }

  if (closesAt && minutesRemaining != null && minutesRemaining <= 0) {
    return {
      status: "CLOSED",
      opensAt,
      closesAt,
      minutesUntilOpen: null,
      minutesRemaining,
      cooldownHours,
      windowHours,
    };
  }

  return {
    status: "OPEN",
    opensAt,
    closesAt,
    minutesUntilOpen: null,
    minutesRemaining,
    cooldownHours,
    windowHours,
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
