/**
 * Extract weather/conditions from an iRacing eventresult JSON payload.
 *
 * The admin Race Center form lets the admin upload (or paste) the same
 * eventresult-XXXX.json file used by the existing CSV importer; this
 * helper parses out just the weather fields we display on the public
 * Race Center "Conditions" card.
 *
 * Source path inside the JSON:
 *   data.session_results[RACE].weather_result
 *
 * Fields we read (all optional in the JSON — defensive coding throughout):
 *   - avg_temp                (air temperature, °C if temp_units === 1)
 *   - avg_skies               (iRacing skies code 0..3)
 *   - avg_cloud_cover_pct
 *   - precip_mm
 *   - precip_time_pct
 *   - temp_units              (0 = Fahrenheit, 1 = Celsius)
 *
 * Track temperature is intentionally NOT pulled — it's not in the
 * eventresult JSON. The admin types it manually if they care.
 */

export type IracingWeatherSummary = {
  airTempC: number | null;
  skiesCode: number | null;
  cloudCoverPct: number | null;
  precipMm: number | null;
  precipTimePct: number | null;
  /** Convenience flag: true if any precipitation was recorded. */
  isWet: boolean;
  /** Subsession ID, for the admin's confirmation banner. */
  subsessionId: number | null;
};

const EMPTY: IracingWeatherSummary = {
  airTempC: null,
  skiesCode: null,
  cloudCoverPct: null,
  precipMm: null,
  precipTimePct: null,
  isWet: false,
  subsessionId: null,
};

/**
 * Parse an unknown payload (already JSON-decoded) into our summary.
 * Returns EMPTY for anything we can't make sense of — never throws.
 */
export function extractWeatherFromEventResult(payload: unknown): IracingWeatherSummary {
  if (!payload || typeof payload !== "object") return EMPTY;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === "object"
    ? (root.data as Record<string, unknown>)
    : root; // tolerate both wrapped and unwrapped shapes

  // Find the RACE simsession. iRacing convention: simsession_name is
  // "RACE", or simsession_type_name contains "Race". Fall back to the
  // last entry (which is typically the race in eventresult exports).
  const sessions = Array.isArray(data.session_results) ? data.session_results : [];
  const race = pickRaceSession(sessions);
  if (!race) return EMPTY;

  const weather = (race as Record<string, unknown>).weather_result;
  if (!weather || typeof weather !== "object") return EMPTY;
  const w = weather as Record<string, unknown>;

  const tempUnits = typeof w.temp_units === "number" ? w.temp_units : 1;
  const avgTempRaw = typeof w.avg_temp === "number" ? w.avg_temp : null;
  // Convert F → C if the file is in Fahrenheit (rare, but be safe).
  const airTempC =
    avgTempRaw === null
      ? null
      : tempUnits === 0
      ? (avgTempRaw - 32) * (5 / 9)
      : avgTempRaw;

  const skiesCode = typeof w.avg_skies === "number" ? Math.round(w.avg_skies) : null;
  const cloudCoverPct = typeof w.avg_cloud_cover_pct === "number" ? w.avg_cloud_cover_pct : null;
  const precipMm = typeof w.precip_mm === "number" ? w.precip_mm : null;
  const precipTimePct = typeof w.precip_time_pct === "number" ? w.precip_time_pct : null;

  const isWet = (precipMm !== null && precipMm > 0) || (precipTimePct !== null && precipTimePct > 0);

  const subsessionId =
    typeof data.subsession_id === "number" ? data.subsession_id : null;

  return { airTempC, skiesCode, cloudCoverPct, precipMm, precipTimePct, isWet, subsessionId };
}

function pickRaceSession(sessions: unknown[]): unknown {
  for (const s of sessions) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const name = typeof rec.simsession_name === "string" ? rec.simsession_name.toLowerCase() : "";
    const typeName =
      typeof rec.simsession_type_name === "string" ? rec.simsession_type_name.toLowerCase() : "";
    if (name === "race" || typeName.includes("race")) return rec;
  }
  // Fallback: last session is usually the race in iRacing exports.
  return sessions.length > 0 ? sessions[sessions.length - 1] : null;
}

/**
 * Human-friendly skies text from the iRacing avg_skies enum.
 * Used by the public renderer; the schema stores the raw code so
 * future translations / localized strings can be derived at render time.
 */
export function skiesLabel(code: number | null): string | null {
  switch (code) {
    case 0:
      return "Clear";
    case 1:
      return "Partly Cloudy";
    case 2:
      return "Mostly Cloudy";
    case 3:
      return "Overcast";
    default:
      return null;
  }
}
