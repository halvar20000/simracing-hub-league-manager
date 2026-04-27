function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a date as DD-MM-YYYY HH:MM (24-hour clock).
 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return (
    pad(date.getDate()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    date.getFullYear() +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

/**
 * Format a date as DD-MM-YYYY (no time).
 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return (
    pad(date.getDate()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    date.getFullYear()
  );
}
