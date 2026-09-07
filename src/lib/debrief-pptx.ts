import PptxGenJS from "pptxgenjs";
import type { DebriefData, DebriefDriver } from "@/lib/debrief";
import { fmtLap, fmtDelta, fmtPct } from "@/lib/debrief";
import type { DebriefPicture, DebriefPictures } from "@/lib/debrief-images";
import type { DebriefRaceDetail } from "@/lib/debrief-stints";

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

/** The three free-text fields the team keeps on the plan. */
export type DebriefNotes = {
  pre: string;
  during: string;
  post: string;
};

/**
 * Centre a picture inside a box without distorting it.
 *
 * pptxgenjs will happily stretch an image to whatever w/h it is given, and a
 * squashed screenshot of somebody's car is the one thing on a debrief slide
 * that everybody notices.
 */
function fitBox(
  pic: DebriefPicture,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(box.w / pic.w, box.h / pic.h);
  const w = pic.w * scale;
  const h = pic.h * scale;
  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h,
  };
}

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

/**
 * The three views of the race itself: the lap trace, the timeline, the stints.
 *
 * The lap trace is a scatter chart — one series per driver, x = lap number —
 * so PowerPoint keeps the numbers behind it and the team can poke at them.
 * The timeline has no chart type in PowerPoint at all, so it is drawn from
 * rectangles; that is fine, because what it has to show is two rows of bars
 * on one clock.
 */
function addRaceSlides(
  pptx: PptxGenJS,
  data: DebriefData,
  race: DebriefRaceDetail
): void {
  // ---- lap times over the race ------------------------------------------
  const laps = race.laps.filter((l) => Number.isFinite(l.sec) && l.sec > 0);
  if (laps.length > 0) {
    const s = pptx.addSlide();
    titleOn(
      s,
      "Rundenzeiten über das Rennen",
      "alle Runden; Box, Gelbphasen und Startrunde sind eigene Reihen"
    );
    const clean = laps.filter((l) => l.x == null).map((l) => l.sec);
    const best = Math.min(...(clean.length ? clean : laps.map((l) => l.sec)));
    // Same clipping as the page: a four-minute repair lap must not flatten
    // the rest of the race into a straight line.
    const yMax = best * 1.25;

    // A PowerPoint scatter chart shares ONE x array across every series and
    // pairs it POSITIONALLY with each y array. So every series has to span the
    // whole race with a hole where that driver was not on track — giving each
    // driver only their own laps silently plots them against the first n lap
    // numbers, which puts most of the race on the wrong lap.
    const xs = laps.map((l) => l.lap);
    const clip = (sec: number) => Math.min(sec, yMax);

    const slots = Array.from(
      new Set(laps.filter((l) => l.x == null).map((l) => l.d))
    ).sort((a, b) => a - b);

    const series: { name: string; values: (number | null)[]; color: string }[] =
      slots.map((slot) => ({
        name: data.drivers[slot]?.name ?? "unbekannt",
        values: laps.map((l) =>
          l.x == null && l.d === slot ? clip(l.sec) : null
        ),
        color: colorFor(slot),
      }));
    if (laps.some((l) => l.x != null))
      series.push({
        name: "aus der Wertung",
        values: laps.map((l) => (l.x != null ? clip(l.sec) : null)),
        color: "A1A1AA",
      });

    s.addChart(
      pptx.ChartType.scatter,
      [
        { name: "Runde", values: xs },
        ...series.map((ser) => ({ name: ser.name, values: ser.values })),
      ],
      {
        x: 0.5,
        y: 1.4,
        w: 12.3,
        h: 5.4,
        chartColors: series.map((ser) => ser.color),
        lineSize: 0,
        lineDataSymbolSize: 5,
        showLegend: true,
        legendPos: "b",
        legendFontSize: 10,
        catAxisTitle: "Runde",
        valAxisTitle: "Rundenzeit (Sekunden)",
        // Without an explicit floor PowerPoint starts the axis at zero and
        // squashes a three-hour race into one flat band.
        valAxisMinVal: Math.floor(best * 0.98),
        valAxisMaxVal: Math.ceil(yMax),
        catAxisMinVal: Math.min(...xs),
        catAxisMaxVal: Math.max(...xs),
        valAxisLabelFontSize: 9,
        catAxisLabelFontSize: 9,
      }
    );
    s.addText(
      `Ausreißer über ${Math.round(yMax)} s sind auf den oberen Rand gesetzt, damit eine Reparaturrunde nicht das ganze Rennen flachdrückt.`,
      { x: 0.5, y: 6.9, w: 12.3, h: 0.3, fontSize: 9, color: MUTED }
    );
  }

  // ---- stint plan against reality ---------------------------------------
  const tl = race.timeline;
  if (tl && tl.spanSec > 0) {
    const s = pptx.addSlide();
    titleOn(
      s,
      "Stintplan gegen Wirklichkeit",
      "oben der Plan, unten der tatsächliche Verlauf; grau die Boxenstopps"
    );
    const X0 = 1.1;
    const WIDTH = 11.7;
    const px = (sec: number) => X0 + (sec / tl.spanSec) * WIDTH;
    const rows: { label: string; bars: typeof tl.actual; y: number }[] = [
      { label: "Plan", bars: tl.planned, y: 2.0 },
      { label: "Ist", bars: tl.actual, y: 3.4 },
    ];
    // An hour grid, spaced so a 24 h race does not get 24 labels.
    const step = tl.spanSec / 3600 <= 4 ? 1800 : tl.spanSec / 3600 <= 10 ? 3600 : 7200;
    for (let t = 0; t <= tl.spanSec; t += step) {
      s.addShape("line", {
        x: px(t),
        y: 1.75,
        w: 0,
        h: 3.1,
        line: { color: "E4E4E7", width: 1 },
      });
      s.addText(fmtClockShort(t), {
        x: px(t) - 0.4,
        y: 4.9,
        w: 0.8,
        h: 0.25,
        fontSize: 9,
        color: MUTED,
        align: "center",
      });
    }
    for (const row of rows) {
      s.addText(row.label, {
        x: 0.35,
        y: row.y,
        w: 0.7,
        h: 0.5,
        fontSize: 11,
        color: MUTED,
        valign: "middle",
      });
      for (const b of row.bars) {
        const w = Math.max(0.03, px(b.endSec) - px(b.startSec));
        s.addShape("roundRect", {
          x: px(b.startSec),
          y: row.y,
          w,
          h: 0.5,
          fill: { color: colorFor(b.d), transparency: row.label === "Plan" ? 45 : 0 },
          line: { color: "FFFFFF", width: 1 },
          rectRadius: 0.03,
        });
        if (w > 0.3)
          s.addText(String(b.index), {
            x: px(b.startSec),
            y: row.y,
            w,
            h: 0.5,
            fontSize: 9,
            bold: true,
            color: "1F2937",
            align: "center",
            valign: "middle",
          });
        if (b.pitSec > 0)
          s.addShape("rect", {
            x: px(b.endSec),
            y: row.y,
            w: Math.max(0.02, px(b.endSec + b.pitSec) - px(b.endSec)),
            h: 0.5,
            fill: { color: "A1A1AA", transparency: row.label === "Plan" ? 55 : 25 },
          });
      }
    }
    if (tl.actual.length < race.stints.length)
      s.addText(
        `${race.stints.length - tl.actual.length} von ${race.stints.length} Stints tragen im Log keine Sessionzeit und fehlen deshalb in der unteren Reihe; in der Stinttabelle stehen sie vollständig.`,
        { x: 0.4, y: 5.35, w: 12.5, h: 0.3, fontSize: 9, color: MUTED }
      );
  }

  // ---- stint by stint ----------------------------------------------------
  if (race.stints.length > 0) {
    const s = pptx.addSlide();
    titleOn(s, "Stint für Stint", "gegen die Prognose des Plans gerechnet");
    const rows: Cell[][] = [
      headerRow([
        "Stint",
        "Fahrer",
        "Runden",
        "von–bis",
        "Ø Rundenzeit",
        "beste Runde",
        "Prognose",
        "Abweichung",
        "Incs",
        "Boxenstopp",
      ]),
    ];
    for (const st of race.stints) {
      const num = (t: string) => ({
        text: dash(t),
        options: { fontSize: 9, align: "right" as const, color: INK },
      });
      rows.push([
        { text: String(st.index), options: { fontSize: 9, color: INK } },
        {
          text: st.driver ?? "–",
          options: { fontSize: 9, color: colorFor(st.d), bold: true },
        },
        num(String(st.laps)),
        num(`${st.startLap ?? "–"}–${st.endLap ?? "–"}`),
        num(fmtLap(st.avgSec)),
        num(fmtLap(st.bestSec)),
        num(fmtLap(st.planSec)),
        num(fmtDelta(st.deltaSec)),
        num(race.incidentsTimed ? String(st.incidents ?? 0) : "—"),
        num(st.pitSec == null ? "—" : `${st.pitSec.toFixed(1).replace(".", ",")} s`),
      ]);
    }
    s.addTable(rows, {
      x: 0.4,
      y: 1.4,
      w: 12.5,
      colW: [0.75, 2.3, 0.9, 1.15, 1.5, 1.4, 1.35, 1.35, 0.6, 1.2],
      rowH: 0.28,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "middle",
      margin: 4,
    });
    if (!race.incidentsTimed)
      s.addText(
        "Incidents je Stint stehen nur zur Verfügung, wenn der Race Logger sie mit Zeitstempel aufgezeichnet hat. Dieses Log enthält keine — die Gesamtzahl je Fahrer im Anhang kommt aus dem eventresult und lässt sich keinem Stint zuordnen.",
        { x: 0.4, y: 7.0, w: 12.5, h: 0.4, fontSize: 9, color: MUTED }
      );
  }
}

/** 5400 → "1:30" on the timeline axis. */
function fmtClockShort(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec - h * 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export async function buildDebriefPptx(
  data: DebriefData,
  trend: DebriefTrend,
  notes: DebriefNotes,
  pictures: DebriefPictures = { poster: null, impressions: [], skipped: 0 },
  race: DebriefRaceDetail | null = null
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CLS16x9", width: 13.333, height: 7.5 });
  pptx.layout = "CLS16x9";
  pptx.author = "CLS — CAS League Scoring";
  pptx.title = `De-briefing — ${data.title}`;

  const subtitle = [data.track, data.car].filter(Boolean).join(" · ");
  const d = data.drivers;

  // ---- 1. title ---------------------------------------------------------
  // Built around the pictures when there are any, the way a team lead builds
  // it by hand: the event poster on the right, a shot from the race on the
  // left, the title underneath.
  {
    const s = pptx.addSlide();
    s.addShape("rect", {
      x: 0,
      y: 0,
      w: 13.333,
      h: 7.5,
      fill: { color: "0F172A" },
    });

    const poster = pictures.poster;
    const shot = pictures.impressions[0] ?? null;

    if (poster) {
      // Posters come both ways — iRacing's event art is portrait, a league's
      // own banner is wide — so the box follows the picture instead of
      // stranding a wide one in a tall hole.
      const wide = poster.w / poster.h > 1.2;
      const box = fitBox(
        poster,
        wide
          ? { x: 7.6, y: 0.7, w: 5.2, h: 3.2 }
          : { x: 8.1, y: 0.6, w: 4.7, h: 6.3 }
      );
      s.addImage({ data: poster.data, ...box });
    }
    if (shot) {
      const box = fitBox(shot, {
        x: 0.9,
        y: 0.6,
        w: poster ? 6.9 : 11.5,
        h: 3.5,
      });
      s.addImage({ data: shot.data, ...box });
    }

    const textY = shot ? 4.5 : 2.5;
    s.addText("De-briefing", {
      x: 0.9,
      y: textY,
      w: poster ? 7.0 : 11.5,
      h: shot ? 0.9 : 1.1,
      fontSize: shot ? 40 : 54,
      bold: true,
      color: "FFFFFF",
    });
    s.addText(data.title, {
      x: 0.9,
      y: textY + (shot ? 0.9 : 1.1),
      w: poster ? 7.0 : 11.5,
      h: 0.55,
      fontSize: shot ? 22 : 26,
      color: "F97316",
    });
    if (subtitle)
      s.addText(subtitle, {
        x: 0.9,
        y: textY + (shot ? 1.45 : 1.7),
        w: poster ? 7.0 : 11.5,
        h: 0.4,
        fontSize: 15,
        color: "94A3B8",
      });
    s.addText(data.official ? "iRacing Special Event" : "Liga-Rennen", {
      x: 0.9,
      y: textY + (shot ? 1.9 : 2.2),
      w: poster ? 7.0 : 11.5,
      h: 0.35,
      fontSize: 12,
      color: "64748B",
    });
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

  // ---- 4. the headline metrics as charts -------------------------------
  // Which panels exist depends on the race. A league round carries no pace
  // curve, so there is no Relativperformance for anybody — and half an empty
  // slide is worse than one chart across the full width, so the panels are
  // laid out from what actually has data and the missing one is named.
  {
    const panels: { title: string; rows: DebriefDriver[]; pick: (d: DebriefDriver) => number }[] = [];
    const rel = d.filter((x) => (x.relPerf ?? x.perf10k) != null);
    if (rel.length > 0)
      panels.push({
        title: "Relativperformance",
        rows: rel,
        pick: (x) => ((x.relPerf ?? x.perf10k) as number) * 100,
      });
    const kon = d.filter((x) => x.consistency != null);
    if (kon.length > 0)
      panels.push({
        title: "Konstanz",
        rows: kon,
        pick: (x) => (x.consistency as number) * 100,
      });

    if (panels.length > 0) {
      const s = pptx.addSlide();
      titleOn(
        s,
        panels.map((p) => p.title).join(" und "),
        "dieses Rennen"
      );
      const W = panels.length === 1 ? 12.3 : 6.0;
      panels.forEach((panel, i) => {
        const x = panels.length === 1 ? 0.5 : i === 0 ? 0.5 : 6.9;
        const vals = panel.rows.map(panel.pick);
        s.addText(panel.title, {
          x,
          y: 1.15,
          w: W,
          h: 0.25,
          fontSize: 11,
          bold: true,
          color: MUTED,
        });
        s.addChart(
          pptx.ChartType.bar,
          [
            {
              name: panel.title,
              labels: panel.rows.map((x2) => x2.name),
              values: vals,
            },
          ],
          {
            x,
            y: 1.4,
            w: W,
            h: 5.4,
            barDir: "bar",
            chartColors: panel.rows.map((x2) => colorFor(x2.slot)),
            showLegend: false,
            showValue: true,
            dataLabelFormatCode: '0.00"%"',
            catAxisLabelFontSize: 10,
            valAxisLabelFontSize: 10,
            valAxisMinVal: Math.floor(Math.min(...vals) - 0.5),
          }
        );
      });
      if (!rel.length)
        s.addText(
          "Für dieses Rennen ist keine Pace-Kurve hinterlegt, deshalb gibt es keine Relativperformance je iRating.",
          { x: 0.5, y: 6.95, w: 12.3, h: 0.3, fontSize: 9, color: MUTED }
        );
    }
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

  // ---- 6b. how the race actually ran ------------------------------------
  if (race) {
    addRaceSlides(pptx, data, race);
  }

  // ---- 7. what the team wrote during the race ---------------------------
  // The plan's own three note fields. The pit wall types into "während" for
  // hours; that is the closest thing to a race log the team has, and it was
  // being thrown away by an export that only carried the post-race line.
  {
    const blocks: { label: string; text: string }[] = [
      { label: "Vor dem Rennen", text: notes.pre.trim() },
      { label: "Während des Rennens", text: notes.during.trim() },
      { label: "Nach dem Rennen", text: notes.post.trim() },
    ].filter((b) => b.text.length > 0);

    // Text boxes, not a table: pptxgenjs's own table auto-paging throws on a
    // long cell, and the pit wall types into "während" for hours. Blocks are
    // measured and moved to a second slide when they no longer fit, so a long
    // race log is carried in full instead of being silently cut off.
    const CHARS_PER_LINE = 150; // ~10 pt across 12.2 in
    const LINE_H = 0.17; // inches per rendered line at 10 pt
    const HEAD_H = 0.34; // the block's heading plus its gap
    const GAP = 0.28; // between blocks
    const TOP = 1.4;
    const BOTTOM = 7.15;

    const linesOf = (t: string) =>
      t
        .split("\n")
        .reduce(
          (a, line) => a + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)),
          0
        );

    // Blocks keep their natural height rather than a share of the slide —
    // dividing the page proportionally leaves a short block floating in a sea
    // of white when the neighbour is long.
    let s2 = pptx.addSlide();
    titleOn(s2, "Notizen aus dem Rennen", "wie sie im Stintplan stehen");
    let y = TOP;
    for (const b of blocks) {
      const h = HEAD_H + linesOf(b.text) * LINE_H;
      if (y > TOP && y + h > BOTTOM) {
        s2 = pptx.addSlide();
        titleOn(s2, "Notizen aus dem Rennen", "Fortsetzung");
        y = TOP;
      }
      s2.addText(b.label, {
        x: 0.55,
        y,
        w: 12.2,
        h: 0.3,
        fontSize: 12,
        bold: true,
        color: ACCENT,
      });
      s2.addText(b.text, {
        x: 0.55,
        y: y + HEAD_H,
        w: 12.2,
        h: Math.max(0.3, h - HEAD_H),
        fontSize: 10,
        color: INK,
        valign: "top",
      });
      y += h + GAP;
    }
  }

  // ---- 8. discussion, as an empty scaffold ------------------------------
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
    // Deliberately EMPTY: this is the scaffold for the meeting, not a place to
    // pretend the notes above already answer it.
    for (const k of keywords) {
      rows.push([
        { text: k, options: { fontSize: 13, color: INK } },
        { text: "", options: { fontSize: 12 } },
      ]);
    }
    s.addTable(rows, {
      x: 0.6,
      y: 1.15,
      w: 12.1,
      colW: [3.2, 8.9],
      rowH: 0.85,
      border: { type: "solid", color: RULE, pt: 1 },
      valign: "top",
      margin: 6,
    });
  }

  // ---- 9. the pictures --------------------------------------------------
  // Everything except the one already on the title slide, six to a slide.
  {
    const rest = pictures.impressions.slice(1);
    for (let page = 0; page * 6 < rest.length; page++) {
      const batch = rest.slice(page * 6, page * 6 + 6);
      const s = pptx.addSlide();
      titleOn(
        s,
        "Impressionen",
        page === 0 ? `${data.title}${data.track ? ` · ${data.track}` : ""}` : null
      );
      const COLS = 3;
      const CW = 4.0;
      const CH = 2.35;
      const X0 = 0.55;
      const Y0 = 1.45;
      const ROW_GAP = 0.5; // leaves room for a caption under each picture
      batch.forEach((pic, i) => {
        const cx = X0 + (i % COLS) * (CW + 0.24);
        const cy = Y0 + Math.floor(i / COLS) * (CH + ROW_GAP);
        s.addImage({
          data: pic.data,
          ...fitBox(pic, { x: cx, y: cy, w: CW, h: CH }),
        });
        if (pic.caption)
          s.addText(pic.caption, {
            x: cx,
            y: cy + CH + 0.04,
            w: CW,
            h: 0.3,
            fontSize: 9,
            color: MUTED,
            align: "center",
          });
      });
    }
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
