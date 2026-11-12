import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";

/**
 * CAS Rating regulation (German), agreed with the CAS leadership 2026-11-12.
 * Admin-only preview for now; the rating itself is not computed yet. The
 * licence card, history curve and race table are a static example taken from
 * the offline prototype (Thomas Herbrig's own data, with his consent).
 */
export const metadata: Metadata = { title: "CAS Rating – Reglement" };

const CHART_POINTS =
  "34.0,110.0 44.0,115.8 54.1,112.2 64.1,119.3 74.1,120.0 84.2,119.0 94.2,125.2 104.2,129.1 114.3,136.3 124.3,141.7 134.4,152.0 144.4,148.8 154.4,153.5 164.5,147.0 174.5,152.7 184.5,146.4 194.6,147.7 204.6,146.2 214.6,127.1 224.7,124.6 234.7,123.5 244.7,123.0 254.8,134.7 264.8,129.5 274.8,123.1 284.9,133.1 294.9,125.1 304.9,120.1 315.0,123.4 325.0,123.5 335.1,111.5 345.1,107.1 355.1,92.3 365.2,98.2 375.2,102.1 385.2,109.3 395.3,113.4 405.3,120.6 415.3,131.9 425.4,118.2 435.4,115.1 445.4,112.4 455.5,114.9 465.5,115.3 475.5,104.4 485.6,93.8 495.6,92.2 505.6,88.9 515.7,92.8 525.7,98.2 535.8,108.9 545.8,123.1 555.8,124.6 565.9,124.0 575.9,130.5 585.9,128.6 596.0,131.2 606.0,141.7";

// value -> y in the 640x220 chart (20..80 mapped onto 186..34)
const chartY = (v: number) => 220 - 34 - ((v - 20) * (220 - 68)) / 60;

const EXAMPLE_RACES: [string, string, string, string, string, string][] = [
  ["21.10.", "Combined Cup · R2", "0,0", "3,3", "–", "3,3"],
  ["21.10.", "Combined Cup · R1", "0,0", "31,7", "–", "31,7"],
  ["14.10.", "SFL Cup · R2", "45,0", "15,4", "–", "60,4"],
  ["14.10.", "SFL Cup · R1", "15,0", "36,9", "–", "51,9"],
  ["07.10.", "Combined Cup · R2", "24,0", "21,5", "–", "45,5"],
  ["07.10.", "Combined Cup · R1", "12,0", "30,8", "–", "42,8"],
  ["23.09.", "Combined Cup · R2", "8,6", "4,4", "–", "13,0"],
  ["23.09.", "Combined Cup · R1", "0,0", "31,1", "–", "31,1"],
  ["16.09.", "SFL Cup · R2", "36,0", "35,3", "–", "71,3"],
  ["16.09.", "SFL Cup · R1", "0,0", "24,0", "–", "24,0"],
];

const SPECIAL_CASES: [string, string, string][] = [
  ["DNF / DSQ", "0 Platzpunkte, Sauberkeit zählt", "gefahren"],
  ["DNS", "zählt nicht", "nicht gefahren"],
  ["Doppelrennen (z. B. SFL, CC, PCC)", "jedes Rennen einzeln", "eine Runde = ein Rennen"],
  [
    "IEC (Teamrennen)",
    "Klassenplatz des Autos, eigene Incidents; nur wer einen Stint gefahren ist",
    "gefahren, wenn mindestens ein Stint",
  ],
  ["Abmeldung für ein Rennen", "–", "nicht gefahren, aber keine No-show-Strafe"],
  [
    "Offizielle Abmeldung von der Saison",
    "–",
    "Stand wird eingefroren, ab Saisonende zählt die Liga nicht mehr. Vor dem ersten Rennen: Liga zählt gar nicht.",
  ],
  [
    "Offizieller CAS-Stream (Stream-Kalender)",
    "–",
    "zählt als gefahren; nicht angemeldet: Bonus (+1 gefahren / +1 Rennen)",
  ],
  [
    "Fun-/Pre-Race-Event",
    "zählt wie jedes Rennen",
    "gefahren: Bonus (+1 / +1); nicht gefahren: zählt nicht",
  ],
];

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-10 border-t border-zinc-800 pt-6 text-xl font-bold text-zinc-100">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-6 text-base font-semibold text-zinc-100">{children}</h3>;
}

const th = "py-2 pr-3 text-left text-xs font-semibold text-zinc-400";
const td = "border-t border-zinc-800 py-2 pr-3 align-top";
const num = "text-right tabular-nums";

export default async function CasRatingPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16 leading-relaxed text-zinc-300">
      <div className="rounded border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm text-orange-200">
        Vorschau nur für Admins. Das CAS Rating wird noch nicht berechnet; Karte,
        Verlauf und Rennliste unten sind ein Beispiel aus dem Prototyp.
      </div>

      <div>
        <h1 className="text-3xl font-bold text-zinc-100">CAS Rating (CR) – Reglement</h1>
        <p className="mt-1 text-zinc-400">
          Eine Zahl von 0 bis 100 für jeden Fahrer der CAS Community. Sie zeigt, wie gut,
          wie sauber und wie regelmäßig jemand bei uns fährt – über alle Ligen.
        </p>
      </div>

      <H2>1. Warum führen wir das CAS Rating ein?</H2>
      <p>
        iRating misst nur den Speed. Eine Community-Liga lebt aber von mehr: von{" "}
        <b className="text-zinc-100">sauberem Fahren</b> und von Fahrern, die{" "}
        <b className="text-zinc-100">die ganze Saison dabei bleiben</b>. Genau das wollen
        wir sichtbar machen und belohnen.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b className="text-zinc-100">Treue zählt.</b> Wer sich anmeldet und regelmäßig
          fährt, steigt. Wer nach ein paar Rennen nicht mehr kommt, sinkt. Volle Felder
          sind besser für alle Fahrer und für die Zuschauer im Stream.
        </li>
        <li>
          <b className="text-zinc-100">Sauberkeit zählt.</b> Wenige Incidents und keine
          Strafen bringen fast die Hälfte der Punkte eines Rennens. Ein sauberer
          Mittelfeldfahrer kann vor einem schnellen, aber wilden Fahrer stehen.
        </li>
        <li>
          <b className="text-zinc-100">Fair und offen.</b> Die Rechnung ist einfach und
          öffentlich. Jeder kann seinen Wert nachrechnen – keine Bauchentscheidungen.
        </li>
        <li>
          <b className="text-zinc-100">Eigenes Feedback.</b> Jeder sieht in seinem
          CLS-Account seinen Wert, den Verlauf und woraus er sich zusammensetzt.
        </li>
      </ul>

      <H2>2. Geltungsbereich</H2>
      <p>
        Das CAS Rating gilt für alle Ligen der CAS Community: GT3 WCT, IEC, Combined Cup,
        SFL Cup, Porsche Community Cup, TSS GT4, NASCAR sowie Fun-/Pre-Race-Events. Jeder
        Fahrer hat <b className="text-zinc-100">ein</b> Rating für alle Ligen zusammen.
        Gewertet werden nur Rennen, deren Ergebnis im CLS veröffentlicht ist.
      </p>

      <H2>3. Berechnung</H2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center text-xl font-bold text-zinc-100">
        CAS Rating = <span className="text-[#ff6b35]">70 %</span> Leistung +{" "}
        <span className="text-[#ff6b35]">30 %</span> Teilnahme
      </div>
      <p>
        Gerechnet wird immer über die <b className="text-zinc-100">letzten 10 Rennen</b>.
        Das Ergebnis wird auf eine Nachkommastelle gerundet.
      </p>

      <H3>3.1 Punkte pro Rennen (max. 100)</H3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Teil</th>
            <th className={`${th} ${num}`}>max.</th>
            <th className={th}>Regel</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>Platz</td>
            <td className={`${td} ${num}`}>60</td>
            <td className={td}>
              Sieger 60, Letzter 0, dazwischen gleichmäßig verteilt. DNF und DSQ = 0.
            </td>
          </tr>
          <tr>
            <td className={td}>Sauberkeit</td>
            <td className={`${td} ${num}`}>40</td>
            <td className={td}>40 minus 4 Punkte je Incident pro 10 Runden (nicht unter 0).</td>
          </tr>
          <tr>
            <td className={td}>Strafen</td>
            <td className={`${td} ${num}`}>–</td>
            <td className={td}>
              Steward-Strafe Kategorie 1 / 2 / 3: −5 / −10 / −20 im betroffenen Rennen.
              <br />
              No-show ohne Abmeldung: −5.
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-zinc-500">
        Beispiel: 20 Runden, 4x Incidents = 2 je 10 Runden = −8 → 32 Sauberkeitspunkte.
      </p>

      <H3>3.2 Leistung</H3>
      <p>Durchschnitt der Rennpunkte aus den letzten 10 Rennen, egal in welcher Liga.</p>

      <H3>3.3 Teilnahme</H3>
      <p>
        Für jede Liga, in der der Fahrer <b className="text-zinc-100">aktuell angemeldet</b>{" "}
        ist, zählen die letzten 10 ausgetragenen Rennen seit seiner Anmeldung: Wie viele
        davon ist er gefahren? Alle angemeldeten Ligen werden zusammengezählt. 10 von 10 =
        100 %.
      </p>
      <p>
        Wer sich für mehrere Ligen anmeldet und nur sporadisch fährt, hat eine niedrige
        Teilnahme. Wer nirgends angemeldet ist, steht bei 50 %.
      </p>

      <H3>3.4 Start</H3>
      <p>
        Beim Einführen beginnen <b className="text-zinc-100">alle Fahrer bei 50</b>:
        Fehlende Rennen bis 10 zählen bei der Leistung mit 50 Punkten und bei der
        Teilnahme als halb gefahren. Jedes echte Rennen ersetzt eines davon. Ein einzelnes
        gutes Rennen bringt also nicht gleich an die Spitze – ein Sieg ohne Incidents hebt
        die Leistung von 50 auf 55. Frühere Ergebnisse werden nicht rückwirkend gewertet.
      </p>

      <H2>4. Sonderfälle</H2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Fall</th>
            <th className={th}>Leistung</th>
            <th className={th}>Teilnahme</th>
          </tr>
        </thead>
        <tbody>
          {SPECIAL_CASES.map(([fall, leistung, teilnahme]) => (
            <tr key={fall}>
              <td className={td}>{fall}</td>
              <td className={td}>{leistung}</td>
              <td className={td}>{teilnahme}</td>
            </tr>
          ))}
          <tr>
            <td className={td}>Nachträgliche Steward-Entscheidung oder Ergebnis-Korrektur</td>
            <td className={td} colSpan={2}>
              Das Rating wird automatisch neu berechnet.
            </td>
          </tr>
        </tbody>
      </table>

      <H2>5. Beispiel</H2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Saison mit 12 Rennen</th>
            <th className={`${th} ${num}`}>Leistung</th>
            <th className={`${th} ${num}`}>Teilnahme</th>
            <th className={`${th} ${num}`}>CAS Rating</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>A fährt alle 12, solide</td>
            <td className={`${td} ${num}`}>70</td>
            <td className={`${td} ${num}`}>100 %</td>
            <td className={`${td} ${num} font-bold text-zinc-100`}>79,0</td>
          </tr>
          <tr>
            <td className={td}>B fährt die ersten 5 stark, dann nicht mehr</td>
            <td className={`${td} ${num}`}>80</td>
            <td className={`${td} ${num}`}>42 %</td>
            <td className={`${td} ${num} font-bold text-zinc-100`}>68,5</td>
          </tr>
        </tbody>
      </table>

      <H2>6. Einsicht im CLS</H2>
      <p>Jeder Fahrer sieht in seinem CLS-Account:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          seine <b className="text-zinc-100">CAS-Rating-Karte</b> mit aktuellem Wert,
          Leistung, Teilnahme und Veränderung seit dem letzten Rennen,
        </li>
        <li>
          den <b className="text-zinc-100">Verlauf</b> als Kurve,
        </li>
        <li>
          die <b className="text-zinc-100">letzten 10 Rennen</b> mit Platz-, Sauberkeits-
          und Strafpunkten,
        </li>
        <li>
          seine <b className="text-zinc-100">Teilnahme pro Liga</b>.
        </li>
      </ul>
      <p>
        Das Rating wird nach jeder Veröffentlichung von Ergebnissen und nach jeder
        Steward-Entscheidung aktualisiert.
      </p>

      <div className="flex flex-wrap items-start gap-8 py-4">
        <LicenceCard />
        <div className="min-w-[260px] flex-1">
          <h3 className="text-base font-semibold text-zinc-100">Verlauf (Leistung)</h3>
          <svg viewBox="0 0 640 220" className="w-full" role="img" aria-label="Beispielverlauf">
            {[20, 30, 40, 50, 60, 70, 80].map((g) => (
              <g key={g}>
                <line x1={34} x2={606} y1={chartY(g)} y2={chartY(g)} stroke="#2a2a33" />
                <text
                  x={26}
                  y={chartY(g) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="#8a8f98"
                >
                  {g}
                </text>
              </g>
            ))}
            <polyline
              points={CHART_POINTS}
              fill="none"
              stroke="#ff6b35"
              strokeWidth={2.5}
              strokeLinejoin="round"
            />
            <circle cx={606} cy={141.7} r={4.5} fill="#ff6b35" />
            <text x={34} y={210} fontSize={11} fill="#8a8f98">
              Start
            </text>
            <text x={606} y={210} fontSize={11} fill="#8a8f98" textAnchor="end">
              heute
            </text>
          </svg>
          <p className="text-xs text-zinc-500">
            Beispiel mit Prototyp-Daten aus den bisherigen Rennen. Im Live-Betrieb beginnt
            die Kurve für alle beim Start mit 50.
          </p>
        </div>
      </div>

      <H3>Letzte 10 Rennen (Beispiel)</H3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Datum</th>
            <th className={th}>Liga</th>
            <th className={`${th} ${num}`}>Platz</th>
            <th className={`${th} ${num}`}>Sauber</th>
            <th className={`${th} ${num}`}>Strafe</th>
            <th className={`${th} ${num}`}>Punkte</th>
          </tr>
        </thead>
        <tbody>
          {EXAMPLE_RACES.map(([date, league, place, clean, pen, total]) => (
            <tr key={`${date}${league}`}>
              <td className={td}>{date}</td>
              <td className={td}>{league}</td>
              <td className={`${td} ${num}`}>{place}</td>
              <td className={`${td} ${num}`}>{clean}</td>
              <td className={`${td} ${num}`}>{pen}</td>
              <td className={`${td} ${num} font-bold text-zinc-100`}>{total}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H2>7. Verwendung: Vorrang auf der Warteliste</H2>
      <p>
        Ist das Grid einer Saison voll, kommen weitere Fahrer auf die Warteliste. Die
        Reihenfolge auf der Warteliste richtet sich nach dem{" "}
        <b className="text-zinc-100">CAS Rating – höchstes Rating zuerst</b>. Bei gleichem
        Rating entscheidet das Anmeldedatum.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b className="text-zinc-100">Fester Platz:</b> Wird ein Platz im Grid frei
          (Abmeldung von der Saison), rückt der Fahrer mit dem höchsten CAS Rating von der
          Warteliste nach.
        </li>
        <li>
          <b className="text-zinc-100">Einzelnes Rennen:</b> Meldet sich ein Fahrer für ein
          Rennen ab, wird der freie Platz für dieses Rennen zuerst dem Fahrer mit dem
          höchsten CAS Rating auf der Warteliste angeboten.
        </li>
        <li>Maßgeblich ist das CAS Rating im Moment, in dem der Platz frei wird.</li>
      </ul>
      <p className="text-xs text-zinc-500">
        Wer regelmäßig und sauber fährt, hat also bessere Chancen auf einen Platz in einer
        vollen Liga.
      </p>

      <H2>8. Inkrafttreten und Änderungen</H2>
      <p>
        Es gibt <b className="text-zinc-100">keinen gemeinsamen Stichtag</b>. Das CAS
        Rating startet in jeder Liga{" "}
        <b className="text-zinc-100">mit ihrer nächsten neuen Saison</b>. Ab dann zählen
        die Rennen dieser Liga für Leistung und Teilnahme. Rennen aus Saisons, die schon
        vor der Einführung liefen, zählen nicht. Fun-/Pre-Race-Events zählen ab dem Tag, an
        dem die erste Liga mit dem CAS Rating startet.
      </p>
      <p>
        Bis zu seinem ersten gewerteten Rennen steht jeder Fahrer bei 50. Das CAS Rating
        ist <b className="text-zinc-100">von Anfang an öffentlich</b> sichtbar.
      </p>
      <p>
        Die CAS-Leitung kann Gewichte und Regeln anpassen, wenn sie sich in der Praxis
        nicht bewähren. Änderungen werden vorher angekündigt. Nach der ersten vollen Saison
        werden die Gewichte überprüft. Fehler im Rating bitte an die Admins melden – sie
        werden korrigiert und das Rating neu berechnet.
      </p>
    </div>
  );
}

function LicenceCard() {
  return (
    <div className="relative w-[300px] rounded-[22px] bg-gradient-to-br from-[#3a3d47] to-[#23252c] p-3.5 shadow-2xl shadow-black/60">
      <div className="absolute left-1/2 top-2.5 h-2 w-14 -translate-x-1/2 rounded bg-[#0a0a0f]" />
      <div className="rounded-[14px] border border-[#33363f] bg-gradient-to-b from-[#1b1d24] to-[#121318] px-4 pb-4 pt-8 text-center">
        <div className="text-xs font-bold tracking-[0.14em] text-[#ff6b35]">
          CAS LEAGUE RATING
        </div>
        <div className="mx-auto mb-2.5 mt-4 flex h-24 w-24 items-center justify-center rounded-full border-[3px] border-[#2c2f38] bg-[radial-gradient(circle_at_35%_30%,#5865f2,#2b2f8f)] text-3xl font-bold text-white">
          TH
        </div>
        <div className="text-2xl font-extrabold text-white">Thomas Herbrig</div>
        <div className="mb-1 mt-2.5 inline-flex items-baseline gap-2.5 rounded-full border-[1.5px] border-[#ff6b35] px-4 py-1">
          <small className="text-xs font-bold tracking-widest text-[#ff6b35]">CR</small>
          <b className="text-2xl tabular-nums text-white">43,6</b>
        </div>
        <div className="text-sm text-red-400">▼ 2,9 seit letztem Rennen</div>
        <div className="mt-2.5 flex justify-center gap-4 text-xs text-zinc-400">
          <div>
            <b className="block text-base text-white">36,5</b>Leistung
          </div>
          <div>
            <b className="block text-base text-white">60 %</b>Teilnahme
          </div>
          <div>
            <b className="block text-base text-white">58</b>Rennen
          </div>
        </div>
        <div className="mt-4 border-t border-[#2c2f38] pt-2.5 text-[11px] tracking-[0.12em] text-[#7d808a]">
          SFL CUP · COMBINED CUP · GT3 WCT
        </div>
        <div className="mt-2.5 font-black tracking-wider text-white">
          CAS <span className="text-[#ff6b35]">COMMUNITY</span>
        </div>
      </div>
    </div>
  );
}
