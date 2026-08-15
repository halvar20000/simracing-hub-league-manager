import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Stint Planner — Anleitung",
  description:
    "Wie der CLS Stint Planner funktioniert: Kurzanleitung für Fahrer und ausführlicher Teil für den Einsatzleiter — Setup, Fuel-Save, Streckentemperatur, Live-Rennen und Auswertung.",
  url: "/stint-planner/anleitung",
});

/** Small helper so every section keeps the same rhythm. */
function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-1 text-xl font-bold text-zinc-100">{title}</h2>
      {lead && <p className="mb-3 text-sm text-zinc-400">{lead}</p>}
      <div className="space-y-3 text-sm leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Shot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="my-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60">
      <Image
        src={src}
        alt={alt}
        width={1372}
        height={893}
        className="w-full"
        unoptimized
      />
      <figcaption className="px-3 py-2 text-xs text-zinc-500">{caption}</figcaption>
    </figure>
  );
}

const K = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">
    {children}
  </span>
);

export default function StintPlannerGuidePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/stint-planner"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Alle Stint-Pläne
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Stint Planner — Anleitung</h1>
        <p className="mt-2 text-zinc-400">
          Der Stint Planner rechnet Sprit, Stintlängen und Fahrerwechsel für
          Langstreckenrennen — und begleitet das Rennen von der Planung über die
          Boxenmauer bis zur Auswertung danach. Diese Seite erklärt beides: was
          Fahrer wissen müssen, und wie der Einsatzleiter den Plan baut.
        </p>
      </div>

      <nav className="mb-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <p className="mb-2 font-semibold text-zinc-200">Inhalt</p>
        <ol className="space-y-1 text-zinc-400">
          <li>
            <a href="#fahrer" className="text-[#ff6b35] hover:underline">
              1. Für Fahrer — in zwei Minuten
            </a>
          </li>
          <li>
            <a href="#aufbau" className="text-[#ff6b35] hover:underline">
              2. Aufbau: drei Tabs
            </a>
          </li>
          <li>
            <a href="#setup" className="text-[#ff6b35] hover:underline">
              3. Plan anlegen (Pre-Race)
            </a>
          </li>
          <li>
            <a href="#pace" className="text-[#ff6b35] hover:underline">
              4. Pace, Sprit und Fuel-Save
            </a>
          </li>
          <li>
            <a href="#stints" className="text-[#ff6b35] hover:underline">
              5. Stintplan, Temperatur und Regen
            </a>
          </li>
          <li>
            <a href="#live" className="text-[#ff6b35] hover:underline">
              6. Während des Rennens
            </a>
          </li>
          <li>
            <a href="#danach" className="text-[#ff6b35] hover:underline">
              7. Nach dem Rennen: Auswertung
            </a>
          </li>
          <li>
            <a href="#faq" className="text-[#ff6b35] hover:underline">
              8. Häufige Fragen
            </a>
          </li>
        </ol>
      </nav>

      <div className="space-y-10">
        <Section
          id="fahrer"
          title="1. Für Fahrer — in zwei Minuten"
          lead="Wenn du nur fährst und den Plan nicht selbst baust, reicht dieser Abschnitt."
        >
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Link öffnen.</strong> Du bekommst vom Einsatzleiter einen
              Link auf den Plan. Kein Login nötig, der Plan ist für alle mit dem
              Link sichtbar — und er aktualisiert sich von selbst, während das
              Rennen läuft.
            </li>
            <li>
              <strong>Tab „During Race“ öffnen.</strong> Dort steht die
              Stint-Tabelle. Deine Stints erkennst du an deinem Namen in der
              Spalte <K>Driver</K>. In der Spalte <K>Spotter</K> steht, wann du
              für jemand anderen am Funk sitzt.
            </li>
            <li>
              <strong>Die drei wichtigsten Spalten:</strong> <K>Clock in</K> ist
              die echte Uhrzeit, zu der du im Auto sein musst.{" "}
              <K>Race start</K> / <K>Race end</K> sind Rennzeiten ab grüner
              Flagge. <K>Laps</K> ist die geplante Rundenzahl deines Stints.
            </li>
            <li>
              <strong>Der grüne Balken oben</strong> zeigt während des Rennens
              den laufenden Stint und den Countdown bis zum nächsten Wechsel.
              Der aktuelle Stint ist in der Tabelle grün hinterlegt.
            </li>
            <li>
              <strong>Discord-Erinnerung.</strong> Wenn der Einsatzleiter{" "}
              <K>🔔 Discord alert</K> aktiviert hat, bekommst du vom Liga-Bot
              eine DM, bevor du dran bist — standardmäßig 15 Minuten vorher.
              Voraussetzung: Du hast dich bei CLS{" "}
              <strong>einmal mit Discord angemeldet</strong>, sonst kennt das
              System deine Discord-ID nicht.
            </li>
          </ol>
          <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-zinc-400">
            <strong className="text-zinc-200">Wichtig:</strong> Die Zeiten
            verschieben sich im Rennen. Wenn die Box eine Reparatur einlegt oder
            eine Safety-Car-Phase kommt, trägt der Einsatzleiter eine Korrektur
            ein — alle folgenden Stints rutschen automatisch mit. Verlass dich
            deshalb auf <K>Clock in</K> im Plan, nicht auf die Uhrzeit, die du
            dir vor dem Rennen notiert hast.
          </p>
        </Section>

        <Section
          id="aufbau"
          title="2. Aufbau: drei Tabs"
          lead="Ein Plan hat drei Leben — und für jedes einen eigenen Tab."
        >
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pre-Race</strong> — Event, Pace &amp; Sprit, Fahrer,
              Garage 61, Verfügbarkeiten, Notizen vor dem Rennen.
            </li>
            <li>
              <strong>During Race</strong> — Kennzahlen, Live-Tracker, Stintplan
              &amp; Boxenzeiten, Fahrersummen.
            </li>
            <li>
              <strong>After Race</strong> — Poster &amp; Bilder,
              Race-Log-Auswertung, Ergebnisliste.
            </li>
          </ul>
          <p>
            Der Plan öffnet automatisch den passenden Tab: vor dem Start
            Pre-Race, ab grüner Flagge During Race, ab 20 Minuten nach
            Zielflagge After Race. Sobald du selbst einen Tab anklickst, gilt
            deine Wahl. Beim Ausdruck sind immer alle drei Bereiche dabei.
          </p>
        </Section>

        <Section
          id="setup"
          title="3. Plan anlegen (Pre-Race)"
          lead="Vier Minuten Arbeit, danach rechnet der Rest von selbst."
        >
          <p>
            Über <K>+ New plan</K> auf der Übersichtsseite. Wichtig sind in der
            Karte <strong>Event</strong>:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <K>Race duration</K> — Renndauer ab grüner Flagge, z. B.{" "}
              <K>6:00:00</K>.
            </li>
            <li>
              <K>Finish on a whole lap (+ 1)</K> — ein Zeitrennen endet nie
              mitten in einer Runde: Es läuft bis zum Ende der Runde, in der die
              Uhr abläuft, und danach noch eine weitere. Mit dem Häkchen rechnet
              der Planer den letzten Stint auf volle Runden plus eine auf — mit
              der Rundenzeit des Stints, in dem die Flagge fällt — und das
              Rennende wird zur Hochrechnung. Diese Runden kosten echten Sprit;
              passen sie nicht mehr in den Tank, zeigt der Plan den zusätzlichen
              Splash-Stopp, den es dafür braucht. Neue Pläne haben das Häkchen
              gesetzt, ältere Pläne behalten ihr altes Rennende.
            </li>
            <li>
              <K>Race start</K> — wann das Rennen wirklich losgeht, als echte
              Uhrzeit. Ohne diese Angabe gibt es keine <K>Clock in</K>-Spalte,
              keinen Live-Tracker und keine Discord-Erinnerungen. Der Knopf{" "}
              <K>Now</K> stempelt den Moment sekundengenau — im Zweifel im
              Augenblick der grünen Flagge drücken, dann verschiebt sich der
              ganze Plan mit. Ein eingetragener <K>Green-flag offset</K> wird
              dabei automatisch herausgerechnet.
            </li>
            <li>
              <K>Green-flag offset</K> — Zeit zwischen Session-Start und grüner
              Flagge (Warm-up, Formationsrunden).
            </li>
            <li>
              <K>Pit time loss</K> — Gesamtverlust pro Stopp: Boxengassen-Delta
              plus Standzeit. <K>Driver swap</K> ist die Mindest-Standzeit für
              den Fahrerwechsel (iRacing: 30 s), <K>Refuel time</K> die reine
              Tankzeit.
            </li>
            <li>
              <K>Fuel tank</K> und <K>Fuel reserve</K> — Tankgröße und
              Sicherheitsreserve, die nie eingeplant wird.
            </li>
            <li>
              <K>Track temp</K> — die Streckentemperatur, für die deine
              eingetragenen Rundenzeiten gelten. Sie ist die Basis für alle
              Temperaturkorrekturen weiter unten.
            </li>
          </ul>
          <p>
            <strong>Fahrer</strong> fügst du im Kasten <K>Roster</K> hinzu, oben
            neben den Fuel Profiles: zwei, drei Buchstaben tippen, mit ↑↓
            auswählen, Enter. Das Feld bleibt aktiv, du kannst also die ganze
            Besetzung hintereinander eintippen. Umlaute sind egal — „muller“
            findet „Müller“. Ein Fahrer muss in CLS registriert sein, damit er
            in der Liste auftaucht. Lege die Besetzung <strong>vor</strong> dem
            Garage-61-Pull an: Der Abgleich läuft über den Namen, wer nicht auf
            dem Plan steht, wird ignoriert. Ein amber eingefärbter Name im
            Roster heißt: Für den Fahrer stehen noch keine eigenen Zahlen im
            Plan.
          </p>
          <p>
            <K>Pace</K> und <K>L/lap</K> pro Fahrer sind die wichtigsten Felder
            der Tabelle: Der Planer rechnet <strong>jeden Stint mit den Werten
            des Fahrers</strong>, der drin sitzt — seine Rundenzeit bestimmt die
            Stintlänge, sein Verbrauch die Runden aus einem Tank. Zwischen zwei
            Fahrern liegt da oft eine ganze Runde pro Stint. Leer lassen heißt:
            Der Fahrer läuft auf dem Standard-Profil; solche Stints sind in der
            Tabelle mit <K>est</K> markiert und die Fahrer stehen über der
            Tabelle namentlich, damit du siehst, welcher Teil des Plans auf
            Annahmen steht.
          </p>
          <p>
            <strong>Wichtig zum Zusammenspiel mit Garage 61:</strong>{" "}
            <K>Apply to plan</K> kopiert die Zahlen des Pulls <em>in</em> die
            Tabelle — mehr macht der Knopf nicht. Was danach in den Feldern
            steht, ist der Plan. Änderst du eine Zahl von Hand, wirkt das{" "}
            <strong>sofort</strong>; es gibt keinen zweiten Schritt und nichts
            zu bestätigen. Ein <span className="text-emerald-300">grün</span>{" "}
            umrandetes Feld enthält einen Wert aus Garage 61, ein{" "}
            <span className="text-amber-200">amber</span> umrandetes deinen
            eigenen — und ein amber umrandetes <em>leeres</em> Feld heißt:
            Garage 61 hat Daten, die aber noch nicht übernommen sind. Die Zahl
            darin ist nur ein Platzhalter und zählt für den Plan nicht.
          </p>
        </Section>

        <Section
          id="pace"
          title="4. Pace, Sprit und Fuel-Save"
          lead="Zwei Zahlen entscheiden über den ganzen Plan: Rundenzeit und Verbrauch pro Runde."
        >
          <p>
            In <strong>Fuel Profiles</strong> trägst du unter{" "}
            <strong>Standard</strong> deine Renn-Pace und den Verbrauch pro
            Runde ein. Daraus ergeben sich Runden pro Stint, Stintlänge und
            Spritmenge — der Planer zeigt sie direkt unter den Feldern. Wichtig:
            Standard ist nur der <strong>Rückfallwert</strong> für Fahrer ohne
            eigene Zahlen. Wer in der Fahrertabelle eine eigene Pace und einen
            eigenen Verbrauch hat, fährt seine Stints damit.
          </p>
          <p>
            Das zweite Profil <strong>Fuel-Saving</strong> aktivierst du per
            Häkchen: etwas langsamere Runde, dafür weniger Verbrauch. In der
            Stint-Tabelle kannst du dann pro Stint zwischen <K>Std</K> und{" "}
            <K>FS</K> umschalten.
          </p>
          <p>
            Sparen ist dabei ein <strong>Aufschlag auf die Werte des jeweiligen
            Fahrers</strong>, kein zweiter Satz absoluter Rundenzeiten: Ein
            FS-Stint rechnet mit „Pace des Fahrers + x Sekunden“ und „Verbrauch
            des Fahrers − y Liter“. Wie groß x und y sind, kannst du pro Fahrer
            in den Spalten <K>FS +s</K> und <K>FS −L</K> hinterlegen — Lift and
            Coast ist Können, der eine kauft dieselben Liter für eine halbe
            Sekunde, der andere zahlt fast zwei. Bleiben die Spalten leer, gilt
            der Abstand zwischen deinem Standard- und deinem Fuel-Saving-Profil
            als Vorgabe.
          </p>
          <p>
            Der Umschalter <strong>Where a stint gets its numbers</strong> steht
            bei neuen Plänen auf <K>Per driver</K>. Pläne, die vor dieser
            Änderung gespeichert wurden, öffnen weiter im alten Modus{" "}
            <K>Profile only</K> und rechnen exakt wie bisher — ein abgeschlossener
            Plan zeigt also weiterhin genau den Ablauf, mit dem er ins Rennen
            gegangen ist. Umstellen kannst du ihn jederzeit von Hand.
          </p>
          <p>
            <strong>Fuel-Save Strategy → Optimize</strong> beantwortet die Frage,
            ob sich Spritsparen lohnt: Die Renndauer ist fix, also gewinnt die
            Strategie, die in dieser Zeit die meiste Distanz zurücklegt. Der
            Optimizer sucht zwischen deinen beiden Profilen die Pace, die gerade
            genug spart, um einen Stopp zu streichen — und gewichtet dabei die
            echten Rundenzeiten deiner Fahrer nach der Zahl ihrer Stints.
          </p>
          <p>
            <strong>Garage 61</strong> (Pre-Race) holt die echten
            Trainingsrunden deines Teams für Strecke und Auto. Damit füllen sich
            die Standard-Pace und die Zeiten der einzelnen Fahrer aus echten
            Daten statt aus Schätzungen — und aus Runden über verschiedene
            Streckentemperaturen berechnet der Planer, wie viel Rundenzeit ein
            Grad kostet.
          </p>
          <p>
            <strong>Mehrere Sessions zusammenrechnen:</strong> Normalerweise
            ersetzt jeder Import (Upload wie Live-Pull) die vorherigen Daten. Mit
            dem Häkchen <K>Add to existing data</K> neben dem Upload-Knopf werden
            die Runden stattdessen <strong>dazugelegt</strong>: Pace, Verbrauch
            und die Temperaturkurve werden über alle Runden neu gerechnet. Genau
            das braucht die Temperaturkurve — zwei Abende bei 25 °C und 35 °C
            sagen dem Planer, was ein Grad kostet, eine einzelne Session bei
            konstanter Temperatur kann das nie. Die Liste{" "}
            <K>Lap pool</K> darunter zeigt jeden Import mit Runden, Fahrern und
            Datum; mit <K>×</K> wirfst du einen wieder raus (Regen-Session,
            falsches Setup) und alles rechnet sich aus dem Rest neu. Dieselbe
            Datei zweimal hochgeladen wird erkannt und ersetzt die alte Kopie,
            statt doppelt zu zählen. Der Pool fasst 2000 Runden — danach fliegt
            der älteste Import raus, die Meldung sagt welcher.
          </p>
        </Section>

        <Section
          id="stints"
          title="5. Stintplan, Temperatur und Regen"
          lead="Die Tabelle unter „During Race“ ist das Herzstück — hier wird geplant und im Rennen korrigiert."
        >
          <Shot
            src="/docs/stint-planner/stint-schedule.jpg"
            alt="Stint-Tabelle mit Steuerleiste"
            caption="Die Steuerleiste über der Tabelle: Regen ab Stint X, Temperatur-Rampe, Discord-Erinnerung, Fahrer automatisch verteilen."
          />
          <p>
            <strong>Fahrer verteilen:</strong> Entweder pro Zeile aus der Liste
            wählen, oder <K>Auto-fill drivers</K> — das verteilt reihum. Mit{" "}
            <K>Double stints</K> in der Event-Karte fährt jeder zwei Stints am
            Stück, was Zeit spart, wenn Tanken länger dauert als der
            Fahrerwechsel. Ein <K>Spotter</K> pro Stint ist optional; ein Fahrer
            kann nicht gleichzeitig fahren und spotten.
          </p>
          <p>
            <strong>Streckentemperatur pro Stint (°C):</strong> Ein leeres Feld
            heißt „läuft auf der Basistemperatur“, also genau die Pace, die du
            eingetragen hast. Trägst du etwas ein, verschiebt sich die
            Rundenzeit dieses Stints entsprechend — rot heißt langsamer als die
            Basis, grün heißt schneller. Die Steigung kommt aus den
            Garage-61-Daten, sonst aus 1,0 s je 10 °C.
          </p>
          <Shot
            src="/docs/stint-planner/temp-ramp.jpg"
            alt="Temperatur-Rampe über neun Stints"
            caption="🌡 Temp ramp: Start 30 °C, Höchstwert 45 °C bei Stint 4, Ende 26 °C — der Planer füllt alle Stints dazwischen."
          />
          <p>
            <strong>Die Rampe</strong> spart das Tippen: Starttemperatur,
            Höchstwert, in welchem Stint der Höchstwert liegt, Endtemperatur —{" "}
            <K>Apply</K>. Der Planer legt eine Linie vom Start zum Höchstwert und
            eine zweite vom Höchstwert zum Ende. Das entspricht einem
            Tagesrennen: Die Strecke heizt sich bis zum frühen Nachmittag auf und
            kühlt danach ab. Lässt du den Höchstwert leer, wird daraus eine
            einzelne Gerade. Einzelne Stints korrigierst du danach von Hand.
          </p>
          <p>
            <strong>Regen:</strong> Das Häkchen <K>Wet</K> pro Stint rechnet den
            Regenaufschlag pro Runde dazu (Standard 12 s/Runde, änderbar in der
            Event-Karte). <K>☔ Rain from stint</K> setzt das Häkchen ab einem
            Stint für alle folgenden, <K>All dry</K> nimmt alle wieder zurück.
          </p>
        </Section>

        <Section
          id="live"
          title="6. Während des Rennens"
          lead="Der Plan ist live: Jede Änderung ist innerhalb weniger Sekunden bei allen, die den Link offen haben."
        >
          <p>
            <strong>
              Die ±min-Spalte ist das wichtigste Werkzeug an der Boxenmauer.
            </strong>{" "}
            Dauert ein Stint länger als geplant — Reparatur, Safety Car, ein
            verpasster Boxenstopp — trägst du die Differenz in Minuten ein. Der
            laufende Stint wird entsprechend länger, und{" "}
            <strong>alle folgenden Stints verschieben sich mit</strong>. Runden
            und Sprit bleiben gleich, weil ein Stint weiterhin durch den Tank
            begrenzt ist. Negative Werte gehen genauso.
          </p>
          <p>
            <strong>Rundenzahl überschreiben.</strong> Kommt das Auto anders
            rein als geplant — Schaden, Shortcut, eine Runde länger hinter dem
            Safety Car — trägst du in der Spalte <K>Laps</K> die Runden ein, die
            wirklich gefahren wurden. Der Stint rechnet mit dieser Zahl, alle
            folgenden verschieben sich mit. Amber heißt: Hier ist das Modell
            überschrieben; rot heißt: So viele Runden gibt der Sprit an Bord
            nicht her. Feld leeren gibt die Runden wieder dem Modell zurück.
          </p>
          <p>
            <strong>Volltanken oder Splash.</strong> Das Häkchen <K>Full</K> ist
            bei jedem Stopp gesetzt — der Tank wird gefüllt. Nimmst du es heraus,
            öffnet sich das Feld <K>Fill L</K> mit der Menge, die eine volle
            Füllung gekostet hätte; du korrigierst sie nach unten. Ein Splash
            macht den Stopp kürzer und den nächsten Stint entsprechend kürzer
            (der ist dann mit <K>short</K> markiert). Die Spalte <K>Left</K>
            zeigt, wie viel Sprit am Stintende noch im Tank ist — über der
            Reserve gerechnet; genau die Menge, die der Stopp wieder reinlegen
            muss.
          </p>
          <p>
            In der Spalte <K>Note</K> hältst du fest, was passiert ist: „Unfall,
            13 Min Reparatur“, „sauberer Stint“. Das ist später bei der
            Auswertung Gold wert — und in der Kachel{" "}
            <strong>Projected finish</strong> siehst du sofort, wie weit ihr vom
            ursprünglichen Plan abgekommen seid.
          </p>
          <p>
            <strong>🔔 Discord alert</strong> schickt dem Fahrer des nächsten
            Stints automatisch eine DM vom Liga-Bot. Vorlaufzeit einstellbar,
            Standard 15 Minuten. Die Erinnerung hängt an der echten Rennuhr,
            berücksichtigt also deine ±-Korrekturen. Mit <K>Test</K> schickst du
            die Nachricht für den nächsten Stint sofort — mach das einmal{" "}
            <strong>vor</strong> dem Rennen, dann weißt du, dass es bei allen
            ankommt.
          </p>
          <p className="rounded border border-amber-800/60 bg-amber-950/20 px-3 py-2 text-amber-200">
            Erscheint oben ein oranges Banner „A new version of the site is
            live“ — Seite neu laden. Nach einem Update funktionieren Uploads und
            das automatische Speichern in einem alten Tab nicht mehr.
          </p>
        </Section>

        <Section
          id="danach"
          title="7. Nach dem Rennen: Auswertung"
          lead="Zwei Dateien aus iRacing, und der Plan wird zum Rennbericht."
        >
          <p>
            <strong>eventresult.json</strong> (aus dem iRacing-Ergebnis
            herunterladen) hochladen: Der Planer zeigt die Ergebnisliste,
            markiert euren Eintrag farbig und liest bei Team-Rennen die
            Fahrerbesetzung mit — Runden, beste Runde, Durchschnitt und
            Incidents pro Fahrer stammen von dort.
          </p>
          <p>
            <strong>race-log .jsonl</strong> (aus dem Race Logger) ergänzt, was
            im Ergebnis nicht steht: den Verlauf. Daraus entsteht das Dashboard
            mit Rundenzeit-Verlauf, Stint-für-Stint-Pace und Boxenstandzeiten.
          </p>
          <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-zinc-400">
            <strong className="text-zinc-200">
              Ø clean statt iRacing-Durchschnitt.
            </strong>{" "}
            iRacing teilt die Gesamtzeit eines Fahrers durch seine Runden — der
            Boxenstopp am Stintende steckt also mittendrin. Wer zwei Stints am
            Stück fährt, schleppt zwei Stopps in seinem Durchschnitt mit und
            sieht langsamer aus als ein Einfachstint-Fahrer; eine Reparatur
            zerlegt den Wert vollends. Die Fahrerkarte zeigt deshalb zusätzlich{" "}
            <K>Ø clean</K>: den Schnitt über die echten Rennrunden, ohne In- und
            Outlap. Das Diagramm <strong>Average lap</strong> rechnet damit; per
            Knopf oben rechts schaltest du auf iRacings eigenen Wert zurück.
          </p>
          <Shot
            src="/docs/stint-planner/race-log.jpg"
            alt="Race-Log-Dashboard mit Fahrerkarten und Rundenzeit-Verlauf"
            caption="Pro Fahrer eine Karte, darunter der Rundenzeit-Verlauf über das ganze Rennen — eine Farbe pro Fahrer, gestrichelt die Klassenbestzeit."
          />
          <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-zinc-400">
            <strong className="text-zinc-200">Warum beide Dateien?</strong> Der
            Race Logger schreibt bei Team-Rennen für ein Auto nur <em>einen</em>{" "}
            Fahrernamen — er sieht die Fahrerwechsel nicht. Die Aufteilung auf
            eure Fahrer kommt deshalb aus der Fahrerreihenfolge in eurem
            Stintplan: Jeder echte Stint wird dem geplanten Stint zugeordnet, mit
            dem er sich zeitlich überschneidet. Deshalb lohnt es sich, die
            ±-Korrekturen im Rennen sauber zu pflegen.
          </p>
          <Shot
            src="/docs/stint-planner/gallery.jpg"
            alt="Poster und Impressionen"
            caption="Poster & impressions: Zertifikat mit der Endplatzierung, dazu bis zu 20 Bilder vom Rennen."
          />
          <p>
            In <strong>Poster &amp; impressions</strong> landen das offizielle
            Zertifikat und eure Bilder vom Rennen. Klick auf ein Vorschaubild
            zeigt es groß, jedes Bild kann eine Bildunterschrift bekommen.
            Formate: JPEG, PNG, WebP, AVIF, GIF — HEIC vom iPhone geht nicht.
          </p>
        </Section>

        <Section id="faq" title="8. Häufige Fragen">
          <dl className="space-y-3">
            <div>
              <dt className="font-semibold text-zinc-100">
                Muss ich den Plan speichern?
              </dt>
              <dd className="text-zinc-400">
                Nur einmal, per <K>Save &amp; share</K>. Danach speichert sich
                jede Änderung automatisch und alle mit dem Link sehen sie
                innerhalb weniger Sekunden.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-100">
                Wer darf einen Plan ändern?
              </dt>
              <dd className="text-zinc-400">
                Jeder mit dem Link — das ist bewusst so, damit an der Boxenmauer
                jeder korrigieren kann, ohne sich anzumelden. Löschen dürfen nur
                Admins.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-100">
                Warum stimmen die Rundenzahlen nicht exakt?
              </dt>
              <dd className="text-zinc-400">
                Der letzte Stint ist fast immer angebrochen — er wird mit{" "}
                <K>FIN</K> markiert. Ohne{" "}
                <K>Finish on a whole lap (+ 1)</K> wird er nur so weit gerechnet,
                wie die Renndauer reicht, also mitten in der Runde; mit dem
                Häkchen endet er auf einer vollen Runde plus einer weiteren, wie
                iRacing es macht.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-100">
                Ein Fahrer bekommt keine Discord-DM.
              </dt>
              <dd className="text-zinc-400">
                Dann fehlt die Verknüpfung: Der Fahrer muss sich einmal bei CLS
                mit Discord anmelden. Der Planer sagt dir das beim Namen, statt
                still nichts zu tun.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-zinc-100">
                Kann ich einen Plan für das nächste Rennen wiederverwenden?
              </dt>
              <dd className="text-zinc-400">
                Ja — auf der Übersichtsseite <K>Duplizieren</K>. Fahrer, Profile
                und Einstellungen bleiben, du änderst nur Strecke, Renndauer und
                Startzeit.
              </dd>
            </div>
          </dl>
        </Section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3 border-t border-zinc-800 pt-6">
        <Link
          href="/stint-planner/new"
          className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          + Neuen Plan anlegen
        </Link>
        <Link
          href="/stint-planner"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Alle Pläne
        </Link>
      </div>
    </main>
  );
}
