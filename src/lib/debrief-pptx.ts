import PptxGenJS from "pptxgenjs";
import type { DebriefData, DebriefDriver } from "@/lib/debrief";
import { fmtLap, fmtDelta, fmtPct } from "@/lib/debrief";

/**
 * The de-briefing as an editable PowerPoint.
 *
 * Deliberately a .pptx and not a PDF: Johann presents this to the team and
 * adds his own slides — preparation, the next events, the discussion notes —
 * so what CLS hands over has to stay editable. The charts are native
 * PowerPoint charts with their data behind them, not pictures, for the same
 * reason.
 *
 * Widescreen 13.33 x 7.5 in (the PptxGenJS "LAYOUT_16x9" is 10 x 5.625; the
 * wider one gives the nine-column table room to breathe at a readable size).
 */

const INK = "18181B";
const MUTED = "52525B";
const RULE = "D4D4D8";
const ACCENT = "C2410C"; // orange-700 — readable on white, unlike the app's #ff6b35
const HEAD_BG = "1F2937";

/** The same categorical order the app uses, dark-surface validated and equally
 *  legible on white. A driver keeps their colour from the lap trace to here. */
const SERIES = ["3987E5", "D95926", "199E70", "C98500", "D55181", "9085E9"];
const colorFor = (slot: number) =>
  slot < 0 ? "71717A" : SERIES[Math.min(slot, SERIES.length - 1)];

export type DebriefTrend = {
  races: string[];
  series: { name: string; slot: number; values: (number | null)[] }[];
};

const NBSP = " ";
const dash = (s: string) => (s === "—" ? "–" : s);

function titleOn(slide: PptxGenJS.Slide, text: string, sub?: string | null) {
  slide.addText(text, {
    x: 0.5,
    y: 0.28,
    w: 12.3,
    h: 0.5,
    fontSize: 26,
    bold: true,
    color: INK,
  });
  if (sub)
    slide.addText(sub, {
      x: 0.5,
      y: 0.78,
      w: 12.3,
      h: 0.3,
      fontSize: 12,
      color: MUTED,
    });
  slide.addShape("line", {
    x: 0.5,
    y: sub ? 1.12 : 0.85,
    w: 12.3,
    h: 0,
    line: { color: ACCENT, width: 2 },
  });
}

type Cell = { text: string; options?: PptxGenJS.TableCellProps };

function headerRow(labels: string[]): Cell[] {
  return labels.map((t) => ({
    text: t,
    options: { bold: true, color: "FFFFFF", fill: { color: HEAD_BG }, fontSize: 10 },
  }));
}

export async function buildDebriefPptx(
  data: DebriefData,
  trend: DebriefTrend,
  postNotes: string
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CLS16x9", width: 13.333, height: 7.5 });
  pptx.layout = "CLS16x9";
  pptx.author = "CLS — CAS League Scoring";
  pptx.title = `De-briefing — ${data.title}`;

  const subtitle = [data.track, data.car].filter(Boolean).join(" · ");
  const d = data.drivers;

  // ---- 1. title ---------------------------------------------------------
  {
    const s = pptx.addSlide();
    s.addShape("rect", {
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      fill: { color: "0F172A" },
    });
    s.addText("De-briefing", {
      x: 0.9,
      y: 2.5,
      w: 11.5,
      h: 1.1,
      fontSize: 54,
      bold: true,
      color: "FFFFFF",
    });
    s.addText(data.title, {
      x: 0.9,
      y: 3.6,
      w: 11.5,
      h: 0.6,
      fontSize: 26,
      color: "F97316",
    });
    if (subtitle)
      s.addText(subtitle, {
        x: 0.9,
        y: 4.2,
        w: 11.5,
        h: 0.4,
        fontSize: 16,
        color: "94A3B8",
      });
    s.addText(
      data.official ? "iRacing Special Event" : "Liga-Rennen",
      { x: 0.9, y: 4.7, w: 11.5, h: 0.35, fontSize: 13, color: "64748B" }
    );
  }

  // ---- 2. awards --------------------------------------------------------
  {
    const s = pptx.addSlide();
    titleOn(s, "Auszeichnungen", "schnell und sicher");
    const rows: Cell[][] = [headerRow(["Auszeichnung", "Fahrer", "Wert"])];
    for (const a of data.awards) {
      rows.push([
        { text: a.label, options: { color: MUTED, fontSize: 13 } },
        { text: a.winner ?? "–", options: { bold: true, color: INK, fontSize: 13 } },
        { text: dash(a.value), options: { color: INK, fontSize: 13, align: "right" } },
      ]);
    }
    s.addTable(rows, {
      x: 0.6,
      y: 1.5,
      w: 12.1,
      colW: [4.4, 4.4, 3.3],
      rowH: 0.52,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "middle",
      margin: 6,
    });
  }

  // ---- 3. evaluation table ---------------------------------------------
  {
    const s = pptx.addSlide();
    titleOn(s, "Auswertung", "je Fahrer, gegen die eigene Referenz gemessen");
    const rows: Cell[][] = [
      headerRow([
        "Fahrer",
        "ges. vs. clean",
        "ges. vs. Prognose",
        "clean vs. Best",
        "Best vs. Ref.",
        "Incs/h",
        "Relativperf.",
        "10k-Perf.",
        "Konstanz",
      ]),
    ];
    for (const r of d) {
      const num = (t: string) => ({
        text: dash(t),
        options: { fontSize: 10, align: "right" as const, color: INK },
      });
      rows.push([
        {
          text: r.name,
          options: { fontSize: 10, color: colorFor(r.slot), bold: true },
        },
        num(fmtDelta(r.dAllVsClean)),
        num(fmtDelta(r.dAllVsPlan)),
        num(fmtDelta(r.dCleanVsBest)),
        num(fmtDelta(r.dBestVsRef)),
        num(
          data.incidentsMeasured && r.incPerHour != null
            ? r.incPerHour.toFixed(2).replace(".", ",")
            : "—"
        ),
        num(fmtPct(r.relPerf)),
        num(fmtPct(r.perf10k)),
        num(fmtPct(r.consistency)),
      ]);
    }
    s.addTable(rows, {
      x: 0.4,
      y: 1.5,
      w: 12.5,
      colW: [2.1, 1.25, 1.4, 1.25, 1.25, 0.9, 1.5, 1.35, 1.5],
      rowH: 0.34,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "middle",
      margin: 4,
    });
    s.addText(
      "Relativperformance = Rundenzeit des eigenen iRatings ÷ tatsächlich gefahrene beste Runde (über 100 % = schneller als das eigene Rating). " +
        "10k-Performance misst dasselbe gegen die feste 10k-Referenz und ist damit über Rennen hinweg vergleichbar. " +
        "Konstanz = 1 − σ ÷ Ø über die sauberen Runden, je Fahrer gegen die eigenen Runden. " +
        "Incidents pro Stunde statt Incidents gesamt, damit nicht bestraft wird, wer die meisten Stints übernommen hat.",
      { x: 0.4, y: 6.5, w: 12.5, h: 0.8, fontSize: 9, color: MUTED }
    );
  }

  // ---- 4. the two headline metrics as charts ---------------------------
  {
    const s = pptx.addSlide();
    titleOn(s, "Relativperformance und Konstanz", "dieses Rennen");
    const named = d.filter((x) => (x.relPerf ?? x.perf10k) != null);
    if (named.length > 0) {
      s.addChart(
        pptx.ChartType.bar,
        [
          {
            name: "Relativperformance",
            labels: named.map((x) => x.name),
            values: named.map((x) => ((x.relPerf ?? x.perf10k) as number) * 100),
          },
        ],
        {
          x: 0.5,
          y: 1.4,
          w: 6.0,
          h: 5.4,
          barDir: "bar",
          chartColors: named.map((x) => colorFor(x.slot)),

          showLegend: false,
          showValue: true,
          dataLabelFormatCode: '0.00"%"',
          catAxisLabelFontSize: 10,
          valAxisLabelFontSize: 10,
          valAxisMinVal: Math.floor(
            Math.min(...named.map((x) => ((x.relPerf ?? x.perf10k) as number) * 100)) - 0.5
          ),
        }
      );
    }
    const kon = d.filter((x) => x.consistency != null);
    if (kon.length > 0) {
      s.addChart(
        pptx.ChartType.bar,
        [
          {
            name: "Konstanz",
            labels: kon.map((x) => x.name),
            values: kon.map((x) => (x.consistency as number) * 100),
          },
        ],
        {
          x: 6.9,
          y: 1.4,
          w: 6.0,
          h: 5.4,
          barDir: "bar",
          chartColors: kon.map((x) => colorFor(x.slot)),

          showLegend: false,
          showValue: true,
          dataLabelFormatCode: '0.00"%"',
          catAxisLabelFontSize: 10,
          valAxisLabelFontSize: 10,
          valAxisMinVal: Math.floor(
            Math.min(...kon.map((x) => (x.consistency as number) * 100)) - 0.5
          ),
        }
      );
    }
    s.addText("Relativperformance", {
      x: 0.5, y: 1.15, w: 6.0, h: 0.25, fontSize: 11, bold: true, color: MUTED,
    });
    s.addText("Konstanz", {
      x: 6.9, y: 1.15, w: 6.0, h: 0.25, fontSize: 11, bold: true, color: MUTED,
    });
  }

  // ---- 5. the trend over the season ------------------------------------
  // Small multiples, not one frame with every driver on it. The categorical
  // palette has six slots; a seventh driver on a shared frame would either
  // repeat a colour or invent one, and past about four lines nobody can follow
  // a single driver anyway. One panel per driver on a SHARED scale stays
  // readable however many drove, and the shared scale is what keeps the panels
  // comparable.
  if (trend.races.length >= 2) {
    const s = pptx.addSlide();
    titleOn(
      s,
      "Verlauf über die Saison",
      "Relativperformance je Rennen — gleiche Skala in allen Feldern"
    );
    const withData = trend.series.filter((x) => x.values.some((v) => v != null));
    const all = withData.flatMap((x) =>
      x.values.filter((v): v is number => v != null && Number.isFinite(v))
    );
    if (withData.length > 0 && all.length > 0) {
      const lo = Math.min(...all) * 100;
      const hi = Math.max(...all) * 100;
      const pad = (hi - lo || 0.2) * 0.2;
      const yMin = Number((lo - pad).toFixed(2));
      const yMax = Number((hi + pad).toFixed(2));

      const cols = withData.length <= 4 ? 2 : withData.length <= 9 ? 3 : 4;
      const rows = Math.ceil(withData.length / cols);
      const X0 = 0.45;
      const Y0 = 1.5;
      const GW = (12.9 - X0) / cols;
      const GH = (7.15 - Y0) / rows;

      withData.forEach((x, i) => {
        const cx = X0 + (i % cols) * GW;
        const cy = Y0 + Math.floor(i / cols) * GH;
        s.addText(x.name, {
          x: cx,
          y: cy,
          w: GW - 0.15,
          h: 0.25,
          fontSize: 11,
          bold: true,
          color: colorFor(x.slot),
        });
        s.addChart(
          pptx.ChartType.line,
          [
            {
              name: x.name,
              labels: trend.races,
              // A gap is what a race this driver did not start should look like.
              values: x.values.map((v) => (v == null ? null : v * 100)),
            },
          ],
          {
            x: cx,
            y: cy + 0.25,
            w: GW - 0.15,
            h: GH - 0.4,
            chartColors: [colorFor(x.slot)],
            showLegend: false,
            lineDataSymbolSize: 8,
            lineSize: 2,
            catAxisLabelFontSize: 8,
            valAxisLabelFontSize: 8,
            valAxisMinVal: yMin,
            valAxisMaxVal: yMax,
            valAxisLabelFormatCode: '0.0"%"',
            valAxisMajorUnit: Number(((yMax - yMin) / 2).toFixed(2)) || undefined,
          }
        );
      });
    }
  }

  // ---- 6. appendix ------------------------------------------------------
  {
    const s = pptx.addSlide();
    titleOn(s, "Anhang", "die Rohdaten hinter der Auswertung");
    const rows: Cell[][] = [
      headerRow([
        "Fahrer",
        "Ø gesamt",
        "Ø clean",
        "Prognose",
        "beste Runde",
        "Referenz",
        "Runden",
        "Stints",
        "Incs",
        "iRating",
      ]),
    ];
    for (const r of d) {
      const num = (t: string | number | null) => ({
        text: t == null ? "–" : dash(String(t)),
        options: { fontSize: 10, align: "right" as const, color: INK },
      });
      rows.push([
        { text: r.name, options: { fontSize: 10, color: colorFor(r.slot), bold: true } },
        num(fmtLap(r.avgAllSec)),
        num(fmtLap(r.avgCleanSec)),
        num(fmtLap(r.planSec)),
        num(fmtLap(r.bestSec)),
        num(fmtLap(r.baselineSec)),
        num(r.laps),
        num(r.stints || null),
        num(data.incidentsMeasured ? r.incidents : null),
        num(r.iRating),
      ]);
    }
    s.addTable(rows, {
      x: 0.4,
      y: 1.5,
      w: 12.5,
      colW: [2.3, 1.3, 1.3, 1.3, 1.4, 1.3, 0.9, 0.8, 0.8, 1.1],
      rowH: 0.34,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "middle",
      margin: 4,
    });
    const refNote = data.official
      ? "Referenz = die Rundenzeit, die das eigene iRating hier wert war; wo das Rating fehlt, die feste 10k-Referenz."
      : "Referenz = die schnellste Runde der eigenen Klasse.";
    const src =
      data.attribution === "plan"
        ? "Die Zuordnung der Stints stammt aus dem Stintplan."
        : data.attribution === "log"
          ? "Die Zuordnung der Stints stammt aus dem Race-Log selbst."
          : "Die Zuordnung der Stints wurde aus den Ergebnissen rekonstruiert.";
    s.addText([refNote, src, ...data.notes].join(NBSP + " "), {
      x: 0.4,
      y: 6.6,
      w: 12.5,
      h: 0.7,
      fontSize: 9,
      color: MUTED,
    });
  }

  // ---- 7. discussion, as an empty scaffold ------------------------------
  {
    const s = pptx.addSlide();
    titleOn(s, "Diskussion", null);
    const keywords = [
      "Strategie / Ziele",
      "Planung",
      "Team-Zusammensetzung",
      "Training",
      "Kommunikation",
      "Fahrzeug",
    ];
    const rows: Cell[][] = [headerRow(["Stichwort", "Notizen"])];
    // The six keywords stay EMPTY on purpose — this is the scaffold for the
    // meeting, not a place to pretend the notes already answer them.
    for (const k of keywords) {
      rows.push([
        { text: k, options: { fontSize: 13, color: INK } },
        { text: "", options: { fontSize: 12 } },
      ]);
    }
    // What the team actually wrote after the race gets its own row rather than
    // being filed under a heading it was never written for.
    if (postNotes.trim()) {
      rows.push([
        {
          text: "Notizen aus dem Plan",
          options: { fontSize: 12, color: MUTED, italic: true },
        },
        { text: postNotes.trim(), options: { fontSize: 11, color: MUTED } },
      ]);
    }
    s.addTable(rows, {
      x: 0.6,
      y: 1.15,
      w: 12.1,
      colW: [3.2, 8.9],
      rowH: postNotes.trim() ? 0.7 : 0.8,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "top",
      margin: 6,
    });
  }

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return out;
}

/** "24h Spa" → "Debriefing_24h-Spa.pptx" — safe on every OS. */
export function debriefFileName(data: DebriefData): string {
  const base = (data.title || "Rennen")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `Debriefing_${base || "Rennen"}.pptx`;
}

/** Unused placeholder guard — keeps the driver type imported for the doc above. */
export type { DebriefDriver };
