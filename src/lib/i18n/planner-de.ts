/**
 * German strings for the stint planner — the DEFAULT language.
 *
 * Typed against `en`, so a missing or misspelt key is a build error rather
 * than an `undefined` on the pit wall during a 24 h race. Add the key in
 * `planner-en.ts` first, then here.
 *
 * Tone: "du", the way the team talks. Established sim-racing loanwords stay
 * English (Stint, Boxenstopp/Pit, Setup, Race Log, Debrief) — translating
 * them would make the tool harder to read, not easier.
 */
import type { PlannerDict } from "./planner";

export const de: PlannerDict = {
  ui: {
    language: "Sprache",
    mode: "Modus",
    easy: "Einfach",
    advanced: "Erweitert",
    easyHint:
      "Einfach blendet aus, was die meisten Teams nie anfassen. Es hört nichts auf zu funktionieren — es ist nur nicht auf dem Bildschirm.",
    advancedHint:
      "Erweitert zeigt jede Stellschraube: das detaillierte Boxenstopp-Modell und die aus einer Session gemessenen Werte.",
    hiddenInEasy: "Im Einfach-Modus ausgeblendet",
    showAdvanced: "Zu Erweitert wechseln",
    guide: "Anleitung",
    guideHint: "Öffnet das Handbuch zu diesem Abschnitt in einem neuen Tab.",
  },
  common: {
    dec: (n: number, digits: number) => n.toFixed(digits).replace(".", ","),
    apply: "Übernehmen",
    clear: "Leeren",
    save: "Speichern",
    saving: "Speichert…",
    delete: "Löschen",
    close: "Schließen",
    add: "Hinzufügen",
    remove: "Entfernen",
    none: "Keine",
    unassigned: "— Nicht besetzt —",
    selectTrack: "— Strecke wählen —",
    selectCar: "— Auto wählen —",
    serverUnreachable: "Server nicht erreichbar — bitte noch einmal versuchen.",
  },


  header: {
    planTitle: "Plantitel",
    planTitleHint:
      "Unter diesem Namen wird der Plan gelistet und geteilt. Strecke und Renndauer ergeben den nützlichsten Titel.",
    planTitlePlaceholder: "z. B. 6h Road America",
    saveShare: "Speichern & teilen",
    live: "Live · speichert automatisch",
    liveSaving: "Speichert…",
    liveError: "Sync-Fehler — versucht erneut",
    liveHint:
      "Dieser Plan ist live: Deine Änderungen werden automatisch gespeichert, und jeder mit dem Link sieht sie innerhalb weniger Sekunden.",
    completedRo: "Abgeschlossen · schreibgeschützt",
    completedRoHint:
      "Dieser Plan ist abgeschlossen — der Plan selbst lässt sich nicht mehr ändern.",
    copyLink: "Link kopieren",
    postDiscord: "Auf Discord posten",
    postingDiscord: "Postet…",
    markCompleted: "✓ Abschließen",
    completing: "Schließt ab…",
    markCompletedHint:
      "Friert den Plan nach dem Rennen ein — die Auswertung bleibt offen, und du kannst ihn jederzeit wieder öffnen.",
    reopen: "↩ Plan wieder öffnen",
    reopening: "Öffnet…",
    print: "Drucken",
    confirmArchive:
      "Diesen Plan als abgeschlossen markieren?\n\nEvent, Fahrer, Stints und Live-Korrekturen werden eingefroren, und die Discord-Benachrichtigungen hören auf. Ergebnisdatei, Race-Log, Bilder und Notizen nach dem Rennen kannst du weiterhin ergänzen — und den Plan jederzeit wieder öffnen.",
    archived: "Plan als abgeschlossen markiert.",
    reopened: "Plan wieder geöffnet.",
    frozenTitle: "Abgeschlossener Plan.",
    frozenBody:
      "Event, Fahrer, Stints und Live-Korrekturen sind gesperrt, und es gehen keine Discord-Benachrichtigungen mehr raus. Rennergebnis, Race-Log, Bilder und Notizen nach dem Rennen lassen sich weiterhin ergänzen.",
    staleTitle: "Eine neuere Version von CLS ist live",
    staleBody:
      "und dieser Tab läuft noch mit der alten — Uploads und automatisches Speichern schlagen fehl, bis du neu lädst.",
    reloadNow: "Jetzt neu laden",
  },

  notes: {
    enlarge: "⤢ Vergrößern",
    enlargeHint: "Öffnet dieses Feld über die ganze Seite — Escape schließt es.",
    doneEsc: "Fertig (Esc)",
    savesAsYouType: "Speichert beim Tippen, genau wie das kleine Feld.",
  },

  checklist: {
    title: "Diesen Plan fertig machen",
    lead: (open: number, total: number) =>
      `${total - open} von ${total} erledigt — klick auf einen Schritt, um dorthin zu springen.`,
    track: "Strecke wählen",
    car: "Auto wählen",
    duration: "Renndauer festlegen",
    lapDistance: "Rundenlänge eintragen",
    lapTime: "Rundenzeit eintragen",
    fuelPerLap: "Verbrauch pro Runde eintragen",
    tank: "Tankgröße eintragen",
    drivers: "Fahrer hinzufügen",
    start: "Session-Start setzen",
  },
  ev: {
    title: "Event",
    leagueRace: "Liga-Rennen",
    officialRace: "Official-Rennen",
    leagueRaceHint:
      "Die Auswertung vergleicht jeden Fahrer mit der schnellsten Runde in der Klasse.",
    officialRaceHint:
      "Die Auswertung vergleicht jeden Fahrer mit der Rundenzeit, die sein eigenes iRating hier wert war, plus einer festen 10k-Referenz.",
    track: "Strecke",
    trackHint:
      "Die Strecke, auf der gefahren wird. Danach werden gemessene Boxenwerte und Garage-61-Runden für genau diese Strecke gesucht — also auch dann wählen, wenn du alle Zahlen von Hand einträgst.",
    car: "Auto",
    carHint:
      "Das Auto, mit dem gefahren wird. Zusammen mit der Strecke entscheidet es, welche gemessenen Boxenwerte und welche Garage-61-Runden gelten.",
    raceEndsOn: "Rennende nach",
    raceEndsOnHint:
      "Zeit: die Flagge fällt nach der Uhr. Runden / Distanz: sie fällt, wenn die Distanz gefahren ist — die Zielzeit ist dann eine Hochrechnung.",
    optTime: "Zeit",
    optLaps: "Runden",
    optDistance: "Distanz",
    raceDuration: "Renndauer (h:mm:ss)",
    raceDurationHint:
      "Wie lange das Rennen ab der grünen Flagge läuft. 6:00:00 für ein 6-Stunden-Rennen, 0:45:00 für einen 45-Minuten-Sprint.",
    roundRaceEnd: "Auf voller Runde beenden (+ 1)",
    roundRaceEndBody:
      "— das Rennen läuft bis zum Ende der Runde, in der die Uhr abläuft, und danach noch eine weitere, statt mitten in der Runde abgeschnitten zu werden. Diese Runden kosten Sprit, deshalb kann der Plan einen Splash zeigen, den die alte Regel verdeckt hat.",
    projectedFinishLabel: "Hochgerechnetes Ziel:",
    raceLaps: "Rennrunden",
    raceLapsHint: "Rundenzahl, über die das Rennen geht.",
    raceLapsPlaceholder: "z. B. 500",
    raceDistance: "Renndistanz",
    raceDistanceHint:
      "Distanz, über die das Rennen geht. Wird durch die Rundenlänge unten geteilt, um das Rundenziel zu bekommen.",
    raceDistancePlaceholder: "z. B. 1000",
    lapLength: "Rundenlänge (km)",
    lapLengthHint: "Länge einer Runde dieser Streckenvariante, in Kilometern.",
    lapLengthPlaceholder: "z. B. 7,004",
    laps: (n: number | string) => `${n} Runden`,
    roundedUp: "(aufgerundet — die Distanz muss zurückgelegt werden).",
    raceEndsAfter: "Rennende nach",
    lapsUnplanned: (n: string) => `— ${n} Runden ungeplant, Stints ergänzen`,
    raceStart: "Rennstart",
    raceStartHint:
      "Der Moment, in dem die grüne Flagge fällt. Alles im Plan wird ab hier gerechnet: vorher die erwartete Zeit eintragen, und wenn die Flagge wirklich fällt, auf „Jetzt“ drücken.",
    now: "Jetzt",
    nowHint: "Stempelt die grüne Flagge auf diese Sekunde. Jeder Stint verschiebt sich mit.",
    nowAlsoDuring: "„Jetzt“ drücken, wenn die Flagge fällt — steht auch im Reiter „Zeitplan & Live“.",
    stopComputedPre:
      "Ein Stopp wird aus den tatsächlich getankten Litern berechnet — ein voller Service kostet hier",
    stopComputedPost: ".",
    stopFlatPre: "Jeder Stopp kostet pauschal",
    stopFlatPost: ".",
    stopWhere: "Boxenzeiten, Fahrerwechsel und die gemessenen Konstanten stehen unter",
    tank: "Tankgröße (L)",
    tankHint:
      "Nutzbares Tankvolumen des Autos in Litern. Zusammen mit dem Verbrauch pro Runde ergibt das die maximale Stintlänge.",
    reserve: "Reserve (L)",
    reserveHint:
      "Sprit, der als Sicherheitspuffer im Tank bleibt — verkürzt die Runden pro Stint.",
    gridFuel: "Sprit bis zum Grid (L)",
    gridFuelHint:
      "Sprit, der zwischen dem Verlassen der Box und der grünen Flagge verbraucht wird — die Runde zum Grid plus die Runden hinter dem Pace Car. Er ist vor dem Rennstart schon weg und geht deshalb NUR vom ersten Stint ab.",
    gridFuelPlaceholder: "z. B. 1,6",
    officialBox: "Official-Rennen — Vergleichsbasis",
    refLap: "Referenzrunde (10k)",
    refLapHint:
      "Die Rundenzeit, die ein sehr starker Fahrer (≈10k iRating) hier fährt. Ersetzt die Klassenbestzeit als Maßstab, damit die Zahl über mehrere Rennen vergleichbar bleibt statt sich mit dem Starterfeld zu ändern. Leer lassen, um sie von der Pace-Kurve abzulesen.",
    paceCurve: "Pace-Kurve (iRating → Runde)",
    paceCurveHint:
      "Eine gemessene Kurve iRating → Rundenzeit für diese Strecke. Damit sagt die Auswertung jedem Fahrer, was sein eigenes iRating hier wert war.",
    curveNone: "— keine —",
    curveExplainPre:
      "Jeder Fahrer wird an der Rundenzeit gemessen, die sein eigenes iRating hier wert war —",
    curveExplainPoints: (n: number) => `${n} Punkte,`,
    curveExplainAt1000: "bei 1000 iR bis",
    curveExplainAt10k: "bei 10k. Das iRating kommt aus der hochgeladenen",
    curveSuggestPre: "Die Bibliothek hat",
    curveSuggestPost:
      "für diese Strecke — auswählen, um Zielzeiten pro Fahrer zu bekommen.",
    curveNonePre:
      "Für diese Strecke gibt es noch keine Kurve. Jeder im Team-Kader kann eine anlegen unter",
    curveNoneLink: "Teamstatistik → Pace-Referenzen",
    curveNonePost: "; ohne sie wird nur die Referenzrunde oben verwendet.",
    trackTemp: "Streckentemperatur (°C)",
    trackTempHint:
      "Erwartete Streckentemperatur am Renntag. Die Rundenzeiten werden über den Garage-61-Temperaturfit (oder den manuellen Koeffizienten) darauf angepasst. Wird übernommen, sobald du das Feld verlässt.",
    trackTempPlaceholder: "z. B. 30",
    tyreMin: "Reifen noch fahrbar ab (%)",
    tyreMinHint:
      "Stints, die darunter enden, werden markiert — die Untergrenze fürs Doppelstinten eines Satzes. Deine Entscheidung, nichts, was eine Session messen kann.",
    stintLength: "Stintlänge",
    stintLengthHint:
      "Spritbegrenzt ist der Normalfall: ein Stint läuft, bis der Tank leer ist. Feste Zeit oder feste Runden erzwingen stattdessen eine Länge — für ein Rennen mit vorgeschriebenem Stintfenster.",
    stintFuel: "Spritbegrenzt",
    stintTime: "Feste Zeit",
    stintLaps: "Feste Runden",
    stintMinutes: "Stint-Minuten",
    stintLapsField: "Stint-Runden",
    stintValueHint: "Die erzwungene Länge, auf die jeder Stint geschnitten wird.",

    tempNoModel:
      "Trag die erwartete Streckentemperatur ein und importier oder hol dann Garage-61-Runden — mit Runden über einen Temperaturbereich hinweg kalibriert sich, wie stark die Rundenzeit pro Grad wandert, und die Pace wird angepasst.",
    tempPaceSetAt: "Pace gesetzt bei",
    tempSensitivity: "· Empfindlichkeit",
    tempFromData: "(aus Garage-61-Daten)",
    tempManual: "(manuelle Schätzung)",
    tempPending: (delta: string, temp: number) =>
      `→ beim Verlassen des Feldes verschieben sich die Rundenzeiten um ${delta}s für ${temp}°C`,
    tempPer10: "s/10°C:",
    tempPer10Hint:
      "Manuelle Rundenzeit-Empfindlichkeit (Sekunden pro 10°C), wird benutzt, wenn die Daten keine Temperaturspreizung zum Fitten hergeben.",

    fullWet: "Voll nass",
    fullWetHint:
      "Sekunden pro Runde auf durchnässter Strecke. Wird aus deinen Regenrunden gemessen, wenn vorhanden; überschreibbar.",
    halfWet: "Halb nass",
    halfWetHint:
      "Sekunden pro Runde auf feuchter oder abtrocknender Strecke — rutschig, aber nicht annähernd wie voll nass. Leer lassen, um einen Anteil des Voll-nass-Aufschlags zu verwenden.",
    traffic: "Renn-Verkehr",
    trafficHint:
      "Sekunden pro Runde, die das Team im Rennen langsamer ist als im Training: Verkehr, dreckige Luft, Autos zum Überholen und Überholtwerden. Wird auf JEDEN Stint addiert — Trainingspace ist immer zu optimistisch.",
    perLap: "s/Runde",
    wetMeasured: "(aus Regenrunden gemessen)",
    wetManual: "(manuelle Schätzung)",
    halfYours: "dein Wert",
    halfDefault: (pct: number) => `Standard: ${pct}% von voll nass`,
    trafficNote: "auf jeden Stint — Trainingspace fährt man allein, ein Rennen nicht",
    weatherNote:
      "Das Wetter wird pro Stint im Zeitplan unten gesetzt; der Verkehr gilt für alle.",

    doubleStint: "Doppelstints (jeder Fahrer fährt 2 Stints zwischen den Wechseln)",
    doubleStintHint:
      "Fasst die Stints beim automatischen Besetzen paarweise zusammen: jeder fährt zwei am Stück, bevor das Auto übergeben wird. Spart bei jedem zweiten Stopp die Fahrerwechselzeit.",
    dsNeedRefuelPre: "Trag oben eine",
    dsNeedRefuelBold: "Tankzeit",
    dsNeedRefuelPost:
      "ein, um Einzel- und Doppelstints zu vergleichen (ein Fahrerwechsel kostet nur dann Zeit, wenn er länger dauert als das Tanken).",
    dsHidden: (refuel: number, swap: number) =>
      `Bei ${refuel}s Tankzeit verschwindet der ${swap}s-Wechsel unter dem Tanken — ein Fahrerwechsel kostet keine Extrazeit, Doppelstints sparen hier also nichts (entscheide nach Fahrer-Kondition).`,
    dsCostPre: "Ein Fahrerwechsel kostet",
    dsCostPost: (swap: number, refuel: number) =>
      `(Wechsel ${swap}s − Tanken ${refuel}s).`,
    dsThisPlan: (same: number, stops: number) =>
      `Dieser Plan: ${same}/${stops} Stopps nur Tanken → spart`,
    dsVsSingle: "gegenüber Einzelstints.",
    dsSaves: (sec: string, laps: string) => `~${sec}s (~${laps} Runden)`,
    dsFull: (same: number, stops: number, sec: string, laps: string) =>
      `Voller Doppelstint-Plan: ${same}/${stops} nur Tanken → spart ~${sec}s (~${laps} Runden). Preis: ein Fahrer fährt zwei Stints am Stück.`,
  },
  pit: {
    title: "Boxenstopp-Modell",
    loadMeasured: "📥 Gemessene Werte laden",
    loadMeasuredCarDefault: "📥 Gemessene Werte laden (Auto-Standard)",
    loadMeasuredExact: (car: string, track: string, source: string | null) =>
      `Gemessen für ${car} in ${track}${source ? ` — ${source}` : ""}`,
    loadMeasuredDefault: (car: string, source: string | null) =>
      `Gemessen für ${car} (Auto-Standard)${source ? ` — ${source}` : ""}`,
    computeEvery: "jeden Stopp berechnen",
    computeEveryHint:
      "Aus: jeder Stopp kostet dieselbe pauschale Sekundenzahl. An: jeder Stopp wird aus den tatsächlich getankten Litern berechnet, dazu ob Reifen draufkommen und ob der Fahrer wechselt — genau das macht einen Splash billiger als einen vollen Service.",

    pitLoss: "Zeitverlust Boxenstopp (s)",
    pitLossHint: "Gesamter Zeitverlust bei einem normalen Stopp mit Fahrerwechsel.",
    refuelSec: "Tankzeit (s)",
    refuelSecHint:
      "Wie lange das Tanken bei einem vollen Stopp dauert. Ist sie ≥ Fahrerwechsel, verschwindet der Wechsel unter dem Tanken (kostenlos) und Doppelstints sparen keine Zeit.",
    refuelSecPlaceholder: "z. B. 40",
    driverSwap: "Fahrerwechsel (s)",
    driverSwapHint:
      "Vorgeschriebene Mindestdauer für den Fahrerwechsel. iRacing = 30s; er läuft parallel zum Tanken und kostet deshalb nur dann Zeit, wenn das Tanken kürzer ist. Wird auch vom detaillierten Modell benutzt.",
    driverSwapHintShort:
      "Vorgeschriebene Mindestdauer für den Fahrerwechsel. iRacing = 30s; er läuft parallel zum Tanken und kostet deshalb nur dann Zeit, wenn das Tanken kürzer ist.",
    flatPre: "Jeder Stopp kostet derzeit dieselben pauschalen",
    flatPost:
      ". Schalte das hier ein, um jeden Stopp aus den tatsächlich getankten Litern zu berechnen, dazu ob Reifen gewechselt werden und ob der Fahrer wechselt — genau das macht einen Splash billiger als einen vollen Service, und es wird einmal pro Auto und Strecke gemessen.",

    measuredTitle: "Gemessene Werte.",
    measuredBodyPre:
      "Diese drei kommen aus einem Session-Export (oder aus der Boxenwert-Bibliothek) — siehe",
    measuredBodyEm: "Diese Werte aus einer Session messen",
    measuredBodyPost:
      "weiter unten. Von Hand eintragen nur, wenn du sie anders gemessen hast.",
    laneLoss: "Zeitverlust Boxengasse (s)",
    laneLossHint:
      "Zeitverlust fürs Einfahren, Anhalten und Ausfahren OHNE jeden Service, gemessen gegen eine grüne Runde.",
    refuelRate: "Tankrate (L/s)",
    refuelRateHint: "GT3 ≈ 2,5 L/s, LMP ≈ 1,81 L/s.",
    tyreChange: "Reifenwechsel (s)",
    tyreChangeHint:
      "Wie lange ein kompletter Reifenwechsel dauert, sobald das Auto steht. Bei einem GT3 ≈ 20 s.",
    tyresAfter: "Reifen NACH dem Tanken",
    tyresAfterHint:
      "An: die Crew wechselt die Reifen erst, wenn getankt ist — beides addiert sich. Aus: sie arbeiten parallel, und nur der längere der beiden Vorgänge zählt.",
    noModelWarn:
      "Trag den Zeitverlust der Boxengasse ein — ohne ihn gibt es nichts, woraus ein Stopp berechnet werden könnte, und der pauschale Zeitverlust bleibt in Gebrauch.",
    noModelHow:
      "Von Hand eintragen, aus der Boxenwert-Bibliothek übernehmen oder aus einem Session-Export messen — siehe direkt darunter.",
    fullService: (litres: string) =>
      `Voller Service (${litres} L + Reifen + Fahrerwechsel):`,
    halfFill: "Halb tanken, keine Reifen, gleicher Fahrer:",
    cheaperThanFull: (sec: string) => `— ${sec} s billiger als ein voller Stopp`,

    measureTitle: "Diese Werte aus einer Session messen",
    reading: "Liest…",
    uploadXlsx: "Session-Export hochladen (.xlsx)",
    poolHint:
      "Dieselbe Datei enthält auch die grünen Runden. An: sie werden dem Rundenpool des Plans hinzugefügt. Aus: sie ersetzen die Garage-61-Daten dieses Plans.",
    poolPre: "Eine hier abgelegte Datei füllt auch den",
    poolBoldPool: "Rundenpool",
    poolMid:
      "in der Garage-61-Karte — Pace und Verbrauch kommen aus denselben Runden. Angehakt wird sie zu den vorhandenen Runden",
    poolBoldAdded: "hinzugefügt",
    poolMid2: "",
    poolCount: (laps: number, imports: number) =>
      ` (aktuell ${laps} Runden aus ${imports} Import${imports === 1 ? "" : "en"})`,
    poolPost: "; ohne Haken ersetzt sie sie. Derselbe Schalter wie dort unten.",
    exportExplainPre: "Die Felder oben werden aus einem Garage-61-",
    exportExplainBold: "Session-Export",
    exportExplainMid:
      "gefüllt — öffne in Garage 61 die Session, wähle Export und leg die .xlsx hier ab. Ein Garage-61-",
    exportExplainEm: "Pull",
    exportExplainPost:
      "kann das nicht: die API lässt In- und Out-Laps weg und meldet nie die getankte Menge — und genau daraus wird ein Stopp gemessen. CLS findet die Stopps in der Datei, du sagst, was bei jedem passiert ist, und ein Klick trägt die Zahlen oben ein.",
    howToDrive: "Wie man die Mess-Session fährt",
    protocol:
      "Um alles in einer Session zu messen: 3–4 saubere Runden am Stück (die Referenz), dann eine Runde durch die Boxengasse ohne anzuhalten, ein Stopp ganz ohne Service, ein Stopp nur mit Reifen und ein Stopp nur mit Sprit (ohne Reifen) — am besten eine große Menge. Nach jedem wieder raus und eine saubere Runde fahren.",
    noStops: "Keine Boxenstopps gemessen",
    stopsFound: (n: number) =>
      `${n} Boxenstopp${n === 1 ? "" : "s"} in dieser Session gemessen`,
    referenceSection: (sec: string, samples: number) =>
      `Referenz-Rundenabschnitt: ${sec} s (Median aus ${samples} sauberen Rundenpaaren). Jeder Stopp ist der letzte Sektor vor der Box plus der erste danach, minus dieser Referenz. Sag bei jedem Stopp, was passiert ist — der Export hält den Sprit fest, nie die Reifen.`,
    colLap: "Runde",
    colDriver: "Fahrer",
    colTimeLost: "Zeitverlust",
    colFuel: "Sprit",
    colWhatHappened: "Was passiert ist",
    kindDrivethrough: "durchgefahren",
    kindStop: "gestanden, kein Service",
    kindTyres: "nur Reifen",
    kindFuel: "nur Sprit",
    kindFuelTyres: "Sprit + Reifen",
    derivedLane: "Boxengasse:",
    derivedTyre: "Reifenwechsel:",
    derivedRefuel: "Tanken:",
    derivedSequential: "Reifen nach dem Tanken",
    derivedParallel: "Reifen unter dem Tanken",
    useInPlan: "In diesem Plan verwenden",
    saveToLibrary: "In die Boxenwert-Bibliothek speichern",
    saveToLibraryHint: (car: string, track: string) =>
      `Als gemessene Werte für ${car}${track ? ` @ ${track}` : ""} speichern`,
    dismiss: "Ausblenden",
    easyNoteFlat: (sec: string) =>
      `Boxenstopp-Modell: jeder Stopp kostet pauschal ${sec} s.`,
    easyNoteDetailed: (sec: string) =>
      `Boxenstopp-Modell: die Stopps werden aus gemessenen Werten berechnet — ein voller Service kostet ${sec} s.`,
  },
  breakdown: {
    lane: "Boxengasse",
    fuel: "Tanken",
    tyres: "Reifen",
    overlapped: (sec: string, what: string) => `${sec}s ${what} parallel`,
    driverChange: "Fahrerwechsel",
  },
  fuel: {
    title: "Sprit-Profile",
    hideFallback: "Rückfall-Profile ausblenden",
    editFallback: "Rückfall-Profile bearbeiten",
    standard: "Standard",
    standardFallback: "Standard (Rückfall für den Kader)",
    savingProfile: "Spritsparen",
    savingFallback: "Spritsparen (Kader-Standard)",
    lapTime: "Rundenzeit (m:ss)",
    lapTimeHint:
      "Die Rundenzeit, aus der ein Stint berechnet wird. Im Pro-Fahrer-Modus ist das nur der Rückfall für einen Fahrer ohne eigene Zeit — ein Rennschnitt, keine Qualifying-Runde.",
    fuelPerLap: "Verbrauch / Runde (L)",
    fuelPerLapHint:
      "Verbrauchte Liter pro Runde. Zusammen mit der Tankgröße bestimmt das, wie lange ein Stint läuft. Nimm den Wert aus einem Rennstint, nicht aus einer einzelnen heißen Runde.",
    lapsPerStint: "Runden/Stint:",
    onTrack: "Auf der Strecke:",
    plusPit: "+Box:",
    fuelPerStint: "Sprit/Stint:",
    fallbackPre:
      "Jeder Stint läuft mit der eigenen Pace und dem eigenen Verbrauch des Fahrers. Nur ein Fahrer ohne eigene Zahlen fällt zurück auf",
    fallbackSavingPre: ", und auf den Spritspar-Standard des Plans von",
    whereNumbers: "Woher ein Stint seine Zahlen nimmt",
    modeDelta: "Pro Fahrer",
    modeAbsolute: "Nur Profil (Alt-Modus)",
    deltaExplainPre: "Jeder Stint läuft mit",
    deltaExplainBold: "der eigenen Durchschnitts-Pace und dem eigenen Verbrauch des Fahrers",
    deltaExplainPost:
      "aus der Fahrertabelle; das Standard-Profil oben ist nur der Rückfall für einen Fahrer, der keine hat. Ein Spritspar-Stint addiert obendrauf das Spritspar-Delta dieses Fahrers.",
    absoluteExplain:
      "Alt-Modus: die Profile unten SIND die Zahlen, und die eigenen Werte eines Fahrers ersetzen sie einfach — womit das Spritspar-Profil für jeden wirkungslos wird, der eigene Pace und Verbrauch hat. Bleibt erhalten, damit Pläne, die so gebaut und abgesegnet wurden, sich weiterhin genau so lesen.",
    enableSaving: "Spritspar-Profil aktivieren",
    enableSavingHint:
      "Fügt ein zweites Profil fürs Lift-and-Coast hinzu, damit ein Stint langsamer, aber mit weniger Litern geplant werden kann — was manchmal einen Stopp aus dem Rennen nimmt.",
    againstStandardPre: "Gegenüber Standard sind das",
    againstStandardMid: "— der Aufwand, den ein Fahrer auf einem",
    fsShort: "FS",
    againstStandardMid2:
      "-Stint aufbringt, sofern er keine eigenen Werte in den Spalten",
    fsPlusS: "FS +s",
    fsMinusL: "FS −L",
    againstStandardPost:
      "der Fahrertabelle stehen hat. Lift-and-Coast ist Können: nicht jeder kauft dieselben Liter zum selben Preis.",
    deltaZero:
      "Im Moment sind beide null, ein Spritspar-Stint ist also identisch mit einem normalen.",
    overFuel:
      "⚠ Diese Stintlänge braucht mehr Sprit, als der nutzbare Tank fasst. Verkürze den Stint, verringere die Reserve oder vergrößere den Tank.",
  },
  units: {
    lap: "Runde",
    laps: "Runden",
    stint: "Stint",
    min: "Min",
  },
  roster: {
    title: "Kader",
    empty:
      "Noch keine Fahrer — tipp oben einen Namen ins Feld. Ein Fahrer muss in CLS registriert sein, um dort zu erscheinen. Füg sie hinzu, bevor du aus Garage 61 holst: der Abruf gleicht über den Namen ab, wer nicht auf dieser Liste steht, wird ignoriert.",
    gapHint:
      "Noch keine eigene Pace und kein eigener Verbrauch — die Stints laufen mit dem Standard-Profil",
    ownFigures: (lap: string, fuel: string) => `${lap} · ${fuel} L/Runde`,
    countPre: (n: number) => `${n} Fahrer.`,
    countPost: "Pace, Verbrauch und Reifenverschleiß werden in der Tabelle",
    driversWord: "Fahrer",
    countPost2:
      "weiter unten gesetzt — sie steht nach dem Garage-61-Block, die Zahlen, auf die du dich dort festlegst, sind also das letzte Wort.",
    missing: (n: number) =>
      `${n} davon ${n === 1 ? "hat" : "haben"} noch keine eigenen Werte und würden mit dem Standard-Profil fahren.`,
    pickerPlaceholder: "CLS-Fahrer hinzufügen…",
    pickerHint:
      "Tipp einen Namen, um einen Fahrer aus CLS hinzuzufügen. Nur registrierte CLS-Mitglieder sind wählbar — der Garage-61-Abruf gleicht über den Namen ab, ein von Hand getippter bekäme also nie Runden.",
    pickerNone: "kein Treffer",
  },

  fs: {
    title: "Spritspar-Strategie",
    optimize: "Optimieren",
    optimizeHint:
      "Probiert jede Stoppzahl durch und rechnet aus, wie viel Rundenzeit du dafür hergeben müsstest. Es wird nichts in den Plan übernommen — das ist eine Analyse, keine Anweisung.",
    lead:
      "Die Rennzeit steht fest, also durchsucht das hier das Pace-/Verbrauchsband nach der Kombination, die die größte Distanz zurücklegt — Rundenzeit gegen weniger Boxenstopps getauscht. Als Band dienen dein Standard- und dein Spritspar-Profil, die Pace wird mit den echten Rundenzeiten pro Fahrer gewichtet (nach gefahrenen Stints). Lies es als Analyse: die Zahlen des Plans bleiben genau so, wie sie sind.",
    bestPre: "Beste:",
    bestStops: (n: number) => `${n} Stopps`,
    bestTargetLap: "· Zielrunde",
    bestFuelPre: "· ≤",
    bestFuelPost: "L/Runde →",
    lapsValue: (n: string) => `${n} Runden`,
    gainTime: (delta: string, faster: boolean, stops: number) =>
      ` — ${delta} ${faster ? "schneller" : "langsamer"} als voller Angriff (${stops} Stopps).`,
    gainLaps: (delta: string, stops: number) =>
      ` — ${delta} Runden gegenüber vollem Angriff (${stops} Stopps).`,
    fullPushOptimal: " — voller Angriff ist hier optimal.",
    colStops: "Stopps",
    colTargetLap: "Zielrunde",
    colFuelPerLap: "Verbrauch/Rd.",
    colLapsPerStint: "Runden/Stint",
    colRaceTime: "Rennzeit",
    colTotalLaps: "Runden gesamt",
    bestApplied: "beste",
    assumesPre:
      "Nimmt an, dass die Rundenzeit zwischen deinen beiden Profilen linear verläuft.",
    assumesTime:
      "Die Distanz steht hier fest, gemessen wird also die Zeit, sie zurückzulegen — Spritsparen zahlt sich aus, wenn es einen Stopp streicht.",
    assumesLaps:
      "„Runden gesamt“ ist hier das Distanzmaß (die Streckenlänge ist konstant).",
  },
  picker: {
    placeholder: "🔍 Fahrer hinzufügen — Namen tippen…",
    noMatch: (query: string) => `Kein CLS-Fahrer passt zu „${query}“.`,
    available: (n: number) => `${n} CLS-Fahrer verfügbar · ↑↓ + Enter`,
  },
  g61: {
    title: "Garage-61-Import",
    ageHint:
      "Wie weit zurück gesucht wird. Pace aus einer alten Saison wurde mit anderer BoP, anderem Reifenmodell und oft anderem Streckenbelag gefahren — meist schlechter als gar keine Daten.",
    ageCurrent: "Aktuelle Saison",
    agePrev: "Diese + letzte Saison",
    age30: "Letzte 30 Tage",
    age60: "Letzte 60 Tage",
    age90: "Letzte 90 Tage",
    ageAll: "Alle Daten",
    pull: "Aus Garage 61 holen",
    pulling: "Holt…",
    pullHint:
      "Holt die Runden deines Teams für die gewählte Strecke + Auto direkt aus Garage 61.",
    upload: "Session-Export(e) hochladen",
    reading: "Liest…",
    cumulative: "Zu vorhandenen Daten hinzufügen",
    cumulativeHint:
      "An: der nächste Abruf oder Upload wird zu den Runden HINZUGEFÜGT, die dieser Plan schon hat, und Pace, Verbrauch und Temperaturfit werden über alle neu berechnet. Aus: jeder Import ersetzt alles.",
    clearAsk: "Wirklich löschen?",
    clearAlsoFigures: "auch die eingetragene Pace & den Verbrauch",
    clearYes: "Ja, löschen",
    cancel: "Abbrechen",
    clearBtn: "Garage-61-Daten löschen",
    clearHint:
      "Entfernt die Garage-61-Auswertung aus diesem Plan — die Tabellen werden leer, und du kannst neu abrufen.",
    leadBold: "Aus Garage 61 holen",
    leadMid:
      "holt die Runden deines Teams für die gewählte Strecke + Auto direkt aus der Garage-61-API — alternativ lädst du Session-Exporte (.xlsx) von Hand hoch. So oder so werden echte Rennpace und Verbrauch pro Runde und Fahrer aus den Trainingsrunden gelesen und füllen das Standard-Profil sowie die Rundenzeit jedes passenden Fahrers. Nur Runden der Fahrer dieses Plans (füg sie vorher unter",
    leadDrivers: "Fahrer",
    leadMid2:
      "hinzu) werden berücksichtigt. Hochgeladene Dateien werden in deinem Browser gelesen — nichts wird gespeichert. Boxenstopp-Konstanten kommen ebenfalls aus einem Export, werden aber oben im",
    leadPit: "Boxenstopp-Modell",
    leadPost: " behandelt, direkt neben den Feldern, die sie füllen.",
    poolTitle: (laps: number, imports: number) =>
      `Rundenpool — ${laps} Runden aus ${imports} Import${imports === 1 ? "" : "en"}`,
    poolNote: (cap: number) =>
      `Pace, Verbrauch und der Temperaturfit werden über alle berechnet. Obergrenze ${cap} Runden — der älteste Import fliegt zuerst.`,
    kindPull: "Abruf",
    kindFile: "Datei",
    sourceSummary: (laps: number, drivers: number, range: string) =>
      `${laps} Runden · ${drivers} Fahrer${range}`,
    importedOn: (day: string) => `Importiert ${day}`,
    removeSource: "Diesen Import entfernen und aus dem Rest neu berechnen",
    connected: "● Mit Garage 61 verbunden",
    connectedTeam: (team: string) => ` · Team ${team}`,
    connectedNoTeam: " · kein Team gewählt",
    sharedToken: "● Nutzt den gemeinsamen Garage-61-Token der Seite",
    notConnected: "● Nicht mit Garage 61 verbunden",
    disconnect: "Trennen",
    changeToken: "Token ändern",
    connectToken: "Meinen Token verbinden",
    saveFirst:
      "Speichere und teile den Plan zuerst, um dein eigenes Garage-61-Konto damit zu verbinden.",
    tokenExplainPre: "Füg einen Garage-61-",
    tokenExplainBold: "Personal Access Token",
    tokenExplainPost:
      "ein (auf garage61.net/developer anlegen). Er wird verschlüsselt, nur bei diesem Plan gespeichert und nie wieder angezeigt — alle im Plan können damit abrufen, ändern kannst nur du als Ersteller.",
    tokenPlaceholder: "Garage-61-Token",
    connect: "Verbinden",
    connecting: "Verbindet…",
    team: "Team",
    selectTeam: "— Team wählen —",
    applyChangesTitle: "Was „In den Plan übernehmen“ ändert",
    notOnRoster: (driver: string, laps: number) =>
      `${driver} — ${laps} Runden, nicht im Kader dieses Plans (ignoriert)`,
    kept: (value: string) => `${value} (behalten — deiner)`,
    cleanLaps: (n: number) => `(${n} saubere Runden)`,
    pace: "Pace",
    fuelWord: "Verbrauch",
    projectedNote: (delta: string) =>
      `Die Pace wird auf die Streckentemperatur des Plans hochgerechnet (${delta} s/Runde gegenüber der Temperatur, bei der diese Runden gefahren wurden) — deshalb weicht sie von der rohen Rennpace der Runden ab.`,
    standardSummary: (lap: string, fuel: string, laps: number) =>
      `Standard-Profil → ${lap} · ${fuel} L/Runde (${laps} saubere Runden)`,
    tempFit: (per10: string, min: string, max: string) =>
      `Temperaturfit ${per10} s/10°C (${min}–${max}°C)`,
    tempFlat: (temp: number) => `alle ~${temp}°C (keine Temperaturspreizung)`,
    applyToPlan: "In den Plan übernehmen",
  },
  drv: {
    title: "Fahrer",
    emptyPre: "Noch keine Fahrer in diesem Plan — füg sie im Kasten",
    emptyRoster: "Kader",
    emptyPost: "oben auf der Seite hinzu.",
    leadPre: "Diese Tabelle ist die Grundlage des Zeitplans.",
    leadPace: "Pace",
    leadAnd: "und",
    leadFuel: "L/Runde",
    leadMid:
      "bestimmen, wie lange der Stint jedes Fahrers dauert und wie viele Runden aus einem Tank kommen. Tipp in eine beliebige Zelle, und der Zeitplan unten aktualisiert sich sofort — es gibt nichts zu übernehmen. Garage 61",
    leadPrefills: "füllt diese Felder nur vor",
    leadMid2: ":",
    leadGreen: "grün",
    leadMid3: "kam aus den Daten,",
    leadAmber: "bernstein",
    leadPost:
      "ist ein Wert, den du getippt hast (ein neuer Abruf lässt ihn in Ruhe; ↺ gibt die Zeile an die Daten zurück).",
    gapsPre: "Fährt mit dem",
    gapsBold: "Standard-Profil",
    gapsMid: "statt mit eigenen Zahlen:",
    gapsPost: ". Diese Stints sind im Zeitplan mit",
    gapsEst: "est",
    gapsPost2: "markiert.",
    applyG61To: (n: number) => `Garage 61 auf ${n} Fahrer anwenden`,
    fixableNote: (names: string) =>
      `Garage 61 hat Runden für ${names} — die Werte stehen als Platzhalter in den Zellen, aber ein Platzhalter ist kein Wert.`,
    manualOnlyNote: (names: string) =>
      `Keine Garage-61-Runden für ${names} — trag Pace und Verbrauch von Hand ein oder ruf mit einem größeren Zeitfenster erneut ab.`,
    colDriver: "Fahrer",
    colLaps: "Runden",
    colLapsHint:
      "Saubere Runden, die Garage 61 für diesen Fahrer auf dieser Strecke + mit diesem Auto gemessen hat.",
    colBest: "Beste",
    colBestHint: "Schnellste saubere Runde in den Garage-61-Daten.",
    colAvg: "Ø Runde",
    colAvgHint:
      "Mittel der sauberen Runden dieses Fahrers — wie er wirklich fährt, nicht seine eine heiße Runde.",
    colTemp: "°C",
    colTempHint: "Streckentemperatur, bei der die Garage-61-Runden gefahren wurden.",
    colPace: "Pace",
    colPaceHint:
      "Rennpace, mit der der Planer rechnet. Aus Garage 61 gefüllt (Median der sauberen Runden, auf die Streckentemperatur des Plans hochgerechnet) — zum Überschreiben einfach tippen.",
    colFuel: "L/Runde",
    colFuelHint:
      "Verbrauch pro Runde, mit dem der Planer rechnet. Aus Garage 61 gefüllt — zum Überschreiben einfach tippen.",
    colWear: "%/Runde",
    colWearHint:
      "Reifenverschleiß in % pro Runde. Garage 61 misst das nicht, du trägst es also selbst ein; leer heißt Plan-Standard.",
    colFsSec: "FS +s",
    colFsSecHint:
      "Sekunden pro Runde, die DIESER Fahrer auf einem Spritspar-Stint hergibt, auf seine eigene Pace addiert. Leer = Plan-Standard (der Abstand zwischen Standard- und Spritspar-Profil).",
    colFsFuel: "FS −L",
    colFsFuelHint:
      "Liter pro Runde, die DIESER Fahrer auf einem Spritspar-Stint spart, von seinem eigenen Verbrauch abgezogen. Leer = Plan-Standard.",
    colRange: "Reichweite/Stint",
    colRangeHint:
      "Wie weit dieser Fahrer mit einem Tank kommt: Runden, und wie lange das bei seiner Pace dauert, inklusive Verkehrsaufschlag (trocken).",
    colLapsTotal: "Runden ges.",
    colLapsTotalHint: "Runden, die dieser Fahrer im aktuellen Zeitplan fährt.",
    colStints: "Stints",
    colStintsHint: "Stints, die dieser Fahrer im aktuellen Zeitplan fährt.",
    tempCellHint: (span: string) =>
      `Streckentemperatur der Garage-61-Runden dieses Fahrers${span}`,
    tempCellSpan: (min: string, max: string, fit: string) =>
      ` — der Import reicht von ${min}–${max}°C${fit}`,
    tempCellFit: (per10: string) => `, gefittet auf ${per10} s pro 10°C`,
    ownFigure: "Dein eigener Wert — ein Garage-61-Abruf überschreibt ihn nicht.",
    fromG61Pace: "Aus Garage 61 (oder leer = Pace des Standard-Profils).",
    fromG61Fuel: "Aus Garage 61 (Median der sauberen Runden).",
    wearHint:
      "Reifenverschleiß in % pro Runde. Wird von Garage 61 nicht gemessen — lies ihn am Auto ab oder lass das Feld für den Plan-Standard leer.",
    fsSecCellHint:
      "Sekunden pro Runde, die dieser Fahrer beim Spritsparen hergibt. Leer = Plan-Standard.",
    fsFuelCellHint:
      "Liter pro Runde, die dieser Fahrer beim Spritsparen spart. Leer = Plan-Standard.",
    evenShareHint: (laps: number) => `Ein gleicher Anteil wären ~${laps} Runden pro Fahrer`,
    resetHint:
      "Eigene Werte verwerfen und den nächsten Garage-61-Abruf wieder füllen lassen",
    removeDriver: "Fahrer entfernen",
    teamRow: "Team",
    weightedHint: "Gewichtet nach den Runden, die jeder Fahrer fährt",
    defaultWear: "Standard-Reifenverschleiß (%/Runde)",
    defaultWearPlaceholder: "0 = aus",
    defaultWearNote:
      "Wird für Fahrer ohne eigenen %/Runde-Wert benutzt. Das misst dir niemand — Garage 61 hält die Mischung fest, nie den Verschleiß — du musst es also selbst einschätzen, pro Fahrer, wo sie sich unterscheiden.",
    dataPrefix: "Daten:",
    dataSessionExport: "Session-Export",
    dataG61: (window: string) => `Garage 61${window ? ` · ${window}` : ""}`,
    dataCleanLaps: (n: number) => `${n} saubere Runden`,
    dataTooOld: (n: number) => ` · ${n} ältere ausgelassen`,
    dataPulled: (day: string) => ` · abgerufen ${day}`,
    evenSharePre: "Gleicher Anteil:",
    evenShareValue: (laps: number) => `${laps} Runden`,
    evenSharePost: "pro Fahrer — wer darunter 85 % liegt, wird bernstein markiert.",
    trafficNote: (sec: number) =>
      `Die Reichweite enthält +${sec} s/Runde Renn-Verkehr.`,
    paceAt: (temp: string, fit: string) =>
      `Die Pace gilt für ${temp} °C${fit}; Temperaturen pro Stint, ½ nass und nass werden im Zeitplan angewendet.`,
    paceFit: (per10: string) => ` (${per10} s/10 °C Fit)`,
    footer:
      "Die Fahrer kommen aus CLS — jeder mit einer Registrierung. Reifenverschleiß misst Garage 61 nicht (es hält die Mischung fest, nie den Verschleiß), und ein Spritspar-Delta ebenso wenig — diese Spalten musst du also immer selbst einschätzen.",
  },
  avail: {
    title: "Verfügbarkeit & Stint-Wünsche",
    lead1:
      "Alle sind standardmäßig verfügbar — hak eine Stunde ab, um einen Fahrer als nicht verfügbar zu markieren. Die Fahrer- und Spotter-Menüs im Zeitplan bieten nur an, wer in der Stunde dieses Stints verfügbar ist.",
    lead2Pre: "Die Spalten rechts sind, was jeder Fahrer",
    lead2Em: "lieber",
    lead2Mid: "täte. Sie werden ausschließlich von",
    lead2Bold: "Fahrer automatisch besetzen",
    lead2Post:
      "benutzt — ein von Hand vergebener Platz und eine Korrektur im Rennen ignorieren sie vollständig. Es sind außerdem Wünsche, keine Regeln: die automatische Besetzung bricht lieber einen, als einen Stint leer zu lassen — und sagt es hinterher.",
    nightFrom: "Nacht zählt ab",
    nightTo: "bis",
    nightNote: "Uhr, echte Zeit auf deiner Uhr — nicht die Tageszeit im Sim.",
    nightNoStart:
      "Setz oben einen Rennstart, sonst lässt sich die Nacht gar nicht bestimmen.",
    colDriver: "Fahrer",
    hourLabel: (h: number) => `Stunde ${h}`,
    hourShort: (h: number) => `S${h}`,
    colNight: "Nacht",
    colNightHint: "Fahren in der echten Nacht, im oben gesetzten Fenster.",
    colRain: "Regen",
    colRainHint: "Stints, die im Zeitplan als halb nass oder nass markiert sind.",
    colStart: "Start",
    colStartHint: "Im Auto sitzen, wenn die Flagge fällt.",
    colMaxRow: "Max. am Stück",
    colMaxRowHint: "Wie viele Stints am Stück dieser Fahrer höchstens will. Leer = kein Limit.",
    prefHint: (what: string) => `Fährt er lieber ${what} — oder lieber nicht?`,
    prefNight: "nachts",
    prefRain: "im Nassen",
    prefStart: "den Start",
    prefHappy: "gerne",
    prefAvoid: "lieber nicht",
    availCell: (driver: string, hour: number) => `${driver} — Stunde ${hour}`,
    maxRowHint: (driver: string) =>
      `Wie viele Stints am Stück ${driver} höchstens will. Leer = kein Limit.`,
    fillTitle: (drivers: number, fair: string) =>
      `Letzte automatische Besetzung — ${drivers} Fahrer, fairer Anteil ${fair} Stints pro Person`,
    fillAllHonoured: "alle Wünsche erfüllt",
    fillStints: (n: number) => `${n} Stint${n === 1 ? "" : "s"}`,
    fillLongestRun: (n: number) => ` · bis zu ${n} am Stück`,
    fillNight: (n: number) => ` · ${n} nachts`,
    fillRain: (n: number) => ` · ${n} im Nassen`,
    fillTakesStart: " · fährt den Start",
    fillBroken: (wishes: string) => `gegen seinen Wunsch: ${wishes}`,
    fillUnavailable: (n: number, stints: string) =>
      `${n} Stint${n === 1 ? "" : "s"} musste${n === 1 ? "" : "n"} an einen als nicht verfügbar markierten Fahrer gehen (Stint ${stints}) — es war niemand sonst da.`,
    fillUnfilled: (stints: string) => `Niemand konnte Stint ${stints} übernehmen.`,
  },
  wish: {
    nightStints: (n: number) => `${n} Nacht-Stint${n === 1 ? "" : "s"}`,
    noNightStint: "kein Nacht-Stint",
    wetStints: (n: number) => `${n} Nass-Stint${n === 1 ? "" : "s"}`,
    noWetStint: "kein Nass-Stint",
    takesStart: "fährt den Start",
    notOnStart: "nicht am Start",
    runTooLong: (n: number) => `${n} Stints am Stück`,
    doubleAgainstWish: "ein Doppelstint",
    tripleAgainstWish: "ein Tripelstint",
    outsideAvailability: (n: number) =>
      `${n} Stint${n === 1 ? "" : "s"} außerhalb seiner Verfügbarkeit`,
  },
  live: {
    stints: "Stints",
    pitStops: "Boxenstopps",
    totalLaps: "Runden gesamt",
    totalFuel: "Sprit gesamt",
    drivers: "Fahrer",
    projectedFinish: "Hochgerechnetes Ziel",
    fairShare: (stints: string) =>
      `Fairer Anteil ≈ ${stints} Stints pro Person. „Hochgerechnetes Ziel“ ist die Rennuhr-Zeit, bei der der Plan derzeit endet — sie entfernt sich von der Renndauer, sobald du im Rennen ±-Korrekturen einträgst.`,
    greenFlagIn: "● Grüne Flagge in",
    greenFlagLabel: "Grüne Flagge",
    greenFlagNotStamped: "noch nicht gestempelt",
    greenFlagPress: "Drücken, sobald die Flagge fällt — der ganze Plan verschiebt sich mit.",
    raceFinished: "● Rennen beendet",
    liveStint: (index: number, driver: string) =>
      `● LIVE — Stint ${index}${driver ? ` · ${driver}` : ""} · nächster Stopp in`,
    liveOnly: "● LIVE",
    notesPre: "Notizen vor dem Rennen",
    notesDuring: "Renn-Notizen",
    notesPost: "Auswertungs-Notizen",
  },
  sched: {
    title: "Stint-Zeitplan & Boxen-Timeline",
    showSpotter: "Spotter einblenden",
    hideSpotter: "Spotter ausblenden",
    spotterToggleHint:
      "Die Spotter-Spalte ist standardmäßig ausgeblendet — sie ist die breiteste Spalte, die niemand zweimal liest.",
    rainFrom: "☔ Regen ab Stint",
    rainFromHint:
      "Markiert diesen und jeden späteren Stint mit dem gewählten Zustand.",
    halfWetBtn: "½ nass",
    halfWetBtnHint: "Feucht / abtrocknend ab diesem Stint",
    wetBtn: "Nass",
    wetBtnHint: "Voll nass ab diesem Stint",
    allDry: "Alles trocken",
    allDryHint: "Alle Nass-Markierungen entfernen",
    tempRamp: "🌡 Temperaturverlauf",
    tempRampHint:
      "Füllt jeden Stint mit einem Streckentemperatur-Verlauf: Start → Höhepunkt → Ende. Lass den Höhepunkt leer für eine gerade Linie. Einzelne Stints kannst du danach korrigieren.",
    tempStart: "Start",
    tempStartHint: "Streckentemperatur bei der grünen Flagge",
    tempPeak: "Peak",
    tempPeakHint:
      "Höchste Streckentemperatur des Rennens — leer lassen für einen geraden Verlauf von Start bis Ende",
    tempPeakAt: "@#",
    tempPeakAtHint: "Stint, in den der Höhepunkt fällt (Standard: der mittlere Stint)",
    tempEnd: "Ende",
    tempEndHint: "Streckentemperatur bei der Zielflagge",
    clearTemps: "Leeren",
    clearTempsHint:
      "Löscht jede Temperatur pro Stint (zurück zur Streckentemperatur des Plans)",
    discordAlert: "🔔 Discord-Hinweis",
    discordAlertHint:
      "Schickt dem Fahrer des nächsten Stints eine Discord-DM, bevor er ins Auto muss. Braucht einen Session-Start und ein in CLS verknüpftes Discord-Konto.",
    alertLeadHint: "Minuten vor Stintbeginn",
    minBefore: "Min vorher",
    testAlert: "Test",
    sendingAlert: "Sendet…",
    testAlertHint:
      "Schickt die DM für den nächsten anstehenden Stint sofort — ein Live-Test der ganzen Kette",
    nothingDue: "Nichts fällig — kein Stint beginnt in Reichweite.",
    autoFill: "Fahrer automatisch besetzen",
    autoFillHint:
      "Besetzt jeden Platz automatisch: gleiche Anteile, Verfügbarkeiten beachtet und die angegebenen Wünsche erfüllt, wo es geht. Hinterher steht da, was gebrochen werden musste.",
    clearAssignments: "Leeren",
    clearAssignmentsHint: "Leert jeden Platz — die Stints selbst bleiben.",
    saveFirstForAlerts:
      "Speicher den Plan zuerst — die Hinweise laufen gegen den gespeicherten Plan.",
    emptyState:
      "Trag Renndauer, Rundenzeit, Verbrauch pro Runde und Tankgröße ein, um den Zeitplan zu erzeugen.",

    colNum: "#",
    colDriver: "Fahrer",
    colSpotter: "Sp.",
    colSpotterHint:
      "Spotter für diesen Stint — Initialen; der volle Name erscheint beim Überfahren.",
    colProfile: "Profil",
    colProfileHint:
      "Std fährt diesen Stint mit der normalen Pace des Fahrers, FS mit seiner Spritspar-Pace — langsamer pro Runde, dafür weniger Liter.",
    colRaceStart: "Rennzeit Start",
    colClockIn: "Uhrzeit",
    colRaceEnd: "Rennzeit Ende",
    colCorrection: "±Min",
    colCorrectionHint:
      "Live-Korrektur in Minuten (±). Wirkt sich auf alle folgenden Stints aus.",
    colLength: "Dauer",
    colLap: "Runde",
    colLapHint:
      "Die Rundenzeit, mit der dieser Stint gerechnet wurde: die eigene Pace des Fahrers plus die Aufschläge für Temperatur, Wetter und Verkehr. Alles andere in der Zeile folgt daraus.",
    colLaps: "Runden",
    colLapsHint:
      "Runden, die dieser Stint läuft. Tipp eine Zahl, um das Modell zu überstimmen — früher reingekommen nach einem Schaden oder einer Abkürzung, oder eine Runde länger draußen geblieben. Feld leeren gibt es dem Modell zurück.",
    colFuel: "Sprit",
    colLeft: "Rest",
    colLeftHint:
      "Sprit, der am Stintende im Tank ist, über der Reserve. Genau das muss der Stopp wieder auffüllen.",
    colFull: "Voll",
    colFullHint:
      "Tank beim Stopp am Ende dieses Stints volltanken. Haken raus, um eine feste Litermenge zu nehmen — ein Splash: kürzerer Stopp, kürzerer nächster Stint.",
    colFillL: "Liter",
    colFillLHint:
      "Liter, die beim Stopp am Ende dieses Stints getankt werden. Nur editierbar, wenn „Voll“ nicht gesetzt ist.",
    colTyres: "🛞",
    colTyresHint:
      "Reifen bei diesem Stopp wechseln? Ohne Haken bleibt der Satz für den nächsten Stint drauf.",
    colTyrePct: "Reifen %",
    colTyrePctHint: "Reifenzustand am Ende dieses Stints.",
    colStop: "Stopp",
    colStopHint:
      "Was dieser Stopp kostet: Boxengasse + Tanken + Reifen + ein nicht überdeckter Fahrerwechsel.",
    colTemp: "°C",
    colTempHint:
      "Streckentemperatur für diesen Stint. Leer = die Streckentemperatur des Plans, also genau die eingetragene Pace.",
    colTrack: "Strecke",
    colTrackHint:
      "Streckenzustand für diesen Stint: trocken, halb nass (feucht/abtrocknend) oder voll nass. Jeder bringt seinen eigenen Aufschlag pro Runde mit.",
    colNote: "Notiz",

    fin: "Ziel",
    profileStd: "Std",
    profileFs: "FS",
    spotterOf: (name: string) => `Spotter: ${name}`,
    noSpotter: "Kein Spotter für diesen Stint",
    nightWindow: (from: string, to: string) =>
      `Beginnt im Nachtfenster (${from}:00–${to}:00 deiner Zeit)`,
    est: "est",
    estHint: (what: string) =>
      `Keine eigene ${what} für diesen Fahrer — es wurde das Standard-Profil benutzt.`,
    estPaceFuel: "Pace und kein eigener Verbrauch",
    estPace: "Pace",
    estFuel: "Verbrauchsangabe",
    lapsOverridden:
      "Von Hand eingetragen — das Modell ist für diesen Stint überstimmt. Feld leeren gibt es zurück.",
    lapsFromModel:
      "Runden aus dem Modell. Tipp eine Zahl, um es zu überstimmen (früher rein, Abkürzung, eine Runde länger).",
    fuelShortMark:
      "Mehr Runden, als der Sprit an Bord hergibt — so weit kommt das Auto nicht.",
    shortFill: "kurz",
    shortFillHint: "Kurzer Stint — der vorherige Stopp war nur ein Splash",
    fuelShortLeft:
      "Der Stint verbrennt mehr, als er zu Beginn hatte — mit diesem Sprit ist er nicht fahrbar.",
    tankAtFlag: (start: string, end: string) =>
      `Tank bei der Flagge: ${start} L → ${end} L (über der Reserve)`,
    condDry: "trocken",
    condHalf: "½ nass",
    condWet: "nass",
    notePlaceholder: "…",
    cellFull: "An diesem Stopp volltanken. Haken raus für einen Splash.",
    cellFillL: "Liter an diesem Stopp.",
    cellTyres: "Reifen an diesem Stopp wechseln",
  },

  lapBreak: {
    profilePace: "(Profil-Pace)",
    driver: (name: string) => `(${name})`,
    driverFallback: (name: string) => `(${name} — keine eigene Pace, Standard-Profil)`,
    atTemp: (temp: number) => `bei ${temp}°C`,
    temperature: "Temperatur",
    fullWet: "voll nass",
    halfWet: "halb nass",
    traffic: "Renn-Verkehr",
    perLap: (lap: string) => `= ${lap} pro Runde`,
    fuelLine: (fuel: string) => `${fuel} L/Runde`,
    fuelFallback: " (Standard-Profil — dieser Fahrer hat keine Verbrauchsangabe)",
  },

  totals: {
    title: "Summen pro Fahrer",
    colDriver: "Fahrer",
    colStints: "Stints",
    colDriveTime: "Fahrzeit",
    colLaps: "Runden",
    colFuel: "Sprit",
  },
  schedCell: {
    tempDelta: (delta: string) =>
      `${delta} s/Runde gegenüber der Basistemperatur des Plans`,
    tempBlank: "Streckentemperatur für diesen Stint (leer = Basistemperatur)",
    weatherDelta: (sec: string) => `+${sec} s/Runde für diesen Stint`,
    conditionPlain: "Streckenzustand für diesen Stint",
    notePlaceholder: "Incident, Wetter, SC…",
  },
  post: {
    galleryTitle: "Poster & Eindrücke",

    logTitle: "Race Log (Pace & Stints)",
    logParsing: "Liest ein…",
    logReplace: "Race-Log .jsonl ersetzen",
    logUpload: "Race-Log .jsonl hochladen",
    logEmptyPre: "Lade die",
    logEmptyPost:
      "des Race Loggers aus der Session hoch, um zu sehen, welche Pace jeder Fahrer wirklich gefahren ist, wie lang die Stints tatsächlich waren und wie lange die Boxenstopps gedauert haben — und um diese Zahlen direkt in den Plan zurückzuspielen.",
    logCarNumber: (n: string) => `Auto #${n}`,
    logTrackTemp: (c: number) => `Strecke ${c} °C`,
    logClassBest: (lap: string) => `Klassenbestzeit ${lap}`,
    logUsePace: "Gemessene Pace für die Fahrer übernehmen",
    logUseTemp: "Streckentemperatur übernehmen",
    logRemove: "Entfernen",
    logOldEventResultPre:
      "Diese Ergebnisdatei wurde hochgeladen, bevor es die Aufteilung nach Team-Fahrern gab. Lade die",
    logOldEventResultPost: "erneut hoch, um das Log pro Fahrer aufzuschlüsseln.",
    logNoTimestamps:
      "Dieses Log wurde ausgewertet, bevor Rundenzeitstempel gespeichert wurden — es lässt sich also nicht der Fahrerreihenfolge deines Zeitplans zuordnen, und das Dashboard behilft sich mit einer Rekonstruktion. Die Rohdatei ist weiterhin archiviert; ein Klick behebt es.",
    logOldAverage:
      "Dieses Log wurde ausgewertet, bevor der Schnitt gelernt hat, Formations- und Startrunde, Runden unter Full Course Yellow und die Restartrunde auszulassen — derzeit fallen nur In- und Out-Lap weg. Die Rohdatei ist weiterhin archiviert; ein Klick rechnet die ganze Auswertung neu.",
    logReanalysing: "Wertet neu aus…",
    logReanalyse: "Log neu auswerten",
    logNeedEventResultPre: "Für ein Team-Rennen lade oben zusätzlich die",
    logNeedEventResultPost:
      "hoch — der Race Logger hält pro Auto nur einen Fahrernamen fest, die Aufteilung auf die Team-Fahrer kommt von dort.",

    resultTitle: "Rennergebnis",
    resultParsing: "Liest ein…",
    resultReplace: "eventresult.json ersetzen",
    resultUpload: "eventresult.json hochladen",
    resultEmptyPre: "Lade nach der Session die iRacing-",
    resultEmptyPost:
      "hoch, um sie bei diesem Plan zu archivieren und die Zielreihenfolge anzuzeigen. Team-Events werden pro Team gelistet; der eigene Eintrag ist hervorgehoben.",
    resultRemove: "Entfernen",
    colPos: "Pos",
    colClass: "Klasse",
    colClassPos: "Kl.",
    colNumber: "#",
    colTeam: "Team / Fahrer",
    colDriver: "Fahrer",
    colCar: "Auto",
    colLaps: "Runden",
    colBest: "Beste",
    colInc: "Inc",
    showAll: (n: number) => `Alle ${n} Einträge zeigen`,
    showOurClass: "Nur unsere Klasse zeigen",
  },
  msg: {
    staleReloadUpload:
      "Die Seite wurde aktualisiert, während dieser Tab offen war — lade die Seite neu und lade die Datei dann noch einmal hoch.",
    staleReloadRetry:
      "Die Seite wurde aktualisiert, während dieser Tab offen war — lade die Seite neu und versuch es dann noch einmal.",
    staleReloadSave:
      "Die Seite wurde aktualisiert, während dieser Tab offen war — lade die Seite neu und speicher dann noch einmal.",
    uploadFailed: "Upload fehlgeschlagen — bitte noch einmal versuchen.",
    reanalyseFailed: "Neuauswertung fehlgeschlagen — bitte noch einmal versuchen.",
    saveFailed: "Speichern fehlgeschlagen — bitte noch einmal versuchen.",

    raceStartStamped:
      "Grüne Flagge gestempelt — der ganze Plan läuft ab dieser Sekunde.",

    resultParsed: (n: number, teams: boolean) =>
      `Ergebnisdatei eingelesen — ${n} ${teams ? "Teams" : "Fahrer"}. Beim Plan gespeichert.`,
    logParsed: (carNumber: string) =>
      `Race Log eingelesen — Stints von Auto #${carNumber}. Beim Plan gespeichert.`,
    logParsedNoCar:
      "Race Log eingelesen. (Kein Auto passte zu den Fahrern dieses Plans, deshalb keine Stint-Aufschlüsselung.)",
    logReanalysed: "Race Log mit dem aktuellen Parser neu ausgewertet.",
    logPaceApplied: "Rundenzeiten der Fahrer aus dem Race Log übernommen.",
    logTempApplied: (c: number) =>
      `Streckentemperatur aus dem Race Log auf ${c} °C gesetzt.`,

    fsApplied: (
      stops: number,
      lap: string,
      fuel: string,
      outcome: string,
      paceNote: string
    ) =>
      `Auf das Standard-Profil übernommen: ${stops} Stopps · Ziel ${lap} bei ${fuel} L/Runde → ${outcome}${paceNote}.`,
    fsOutcomeTime: (time: string, laps: number) => `${time} für ${laps} Runden`,
    fsOutcomeLaps: (laps: string) => `${laps} Runden`,

    g61NoLapData:
      "Keine Rundendaten gefunden — ist das ein Garage-61-Session-Export (.xlsx)?",
    g61NoMatch: (laps: number, seen: string) =>
      `Keine der ${laps} Runden in der Datei wurde von den Fahrern dieses Plans gefahren. In der Datei stehen: ${seen}. Gleich die Namen an oder füg den Fahrer dem Plan hinzu.`,
    g61NoDriverName: "kein Fahrername",
    g61NoCleanLap: (laps: number) =>
      `${laps} Runden gefunden, aber keine saubere volle darunter — In-/Out-Laps, Teilrunden und Runden ohne Spritdaten sind nicht verwendbar. Fahr ein paar grüne Runden am Stück.`,
    g61Added: (added: number, total: number, imports: number) =>
      `${added} Runde${added === 1 ? "" : "n"} zum Pool hinzugefügt — jetzt ${total} Runden aus ${imports} Import${imports === 1 ? "" : "en"}.`,
    g61Duplicate:
      " Diese Datei war schon im Pool und hat die frühere Kopie ersetzt, statt doppelt zu zählen.",
    g61Evicted: (n: number, cap: number, names: string) =>
      ` Ältester Import${n === 1 ? "" : "e"} entfernt, um unter ${cap} Runden zu bleiben: ${names}.`,
    g61FileRead: "Datei nicht lesbar — ist es ein gültiger .xlsx-Export?",
    g61Applied: (matched: number, tempNote: string) =>
      `In die Fahrertabelle übernommen: Pace + Verbrauch für ${matched} Fahrer.${tempNote} Speichern behält es.`,
    g61SourceRemoved: (laps: number, imports: number) =>
      `Import entfernt — aus ${laps} Runden über ${imports} Import${imports === 1 ? "" : "e"} neu berechnet. „In den Plan übernehmen“ schreibt die neuen Werte in die Fahrertabelle.`,
    g61SourceRemovedEmpty: "Import entfernt — keine sauberen Runden mehr im Pool.",
    g61ClearedWithFigures:
      "Garage-61-Daten gelöscht, samt der Pace und dem Verbrauch, die sie eingetragen hatten. Selbst getippte Werte sind geblieben. Speichern macht es dauerhaft.",
    g61Cleared:
      "Garage-61-Daten gelöscht. Pace und Verbrauch, die schon in der Fahrertabelle standen, sind geblieben — das sind jetzt die Zahlen des Plans. Speichern macht es dauerhaft.",
    g61NeedTrack:
      "Wähl oben zuerst eine Strecke — der Live-Abruf nutzt Strecke und Auto des Events.",
    g61PullFailed: "Live-Abruf fehlgeschlagen — bitte noch einmal versuchen.",
    g61PullTrackFallback: "Strecke",
    g61Pulled: (laps: number, source: string, window: string) =>
      `${laps} Runde${laps === 1 ? "" : "n"} aus Garage 61 geholt (${source}, ${window})`,
    g61PulledTooOld: (n: number) =>
      ` · ${n} ältere Runde${n === 1 ? "" : "n"} ausgelassen`,

    g61NeedToken: "Füg zuerst deinen Garage-61-Personal-Access-Token ein.",
    g61ConnectedPickTeam: "Verbunden. Wähl unten aus, von welchem Team abgerufen wird.",
    g61ConnectedOk: "Verbunden ✓",
    g61ConnectFailed: "Verbindung fehlgeschlagen — bitte noch einmal versuchen.",
    g61Disconnected: "Getrennt.",

    pitApplied: "Die gemessenen Werte stehen im Boxenstopp-Modell dieses Plans.",
    pitLibraryIncomplete:
      "Die Bibliothek braucht alle drei: Boxengassen-Verlust, Tankrate und Reifenzeit. Beschrifte die fehlenden Stopp-Arten oder fahr den fehlenden Stopp.",
    pitLibrarySaved: (car: string, track: string) =>
      `In der Bibliothek gespeichert für ${car}${track ? ` @ ${track}` : ""}.`,

    tempRampNeedEnds:
      "Trag mindestens eine Start- und eine Endtemperatur für den Verlauf ein.",
    tempRamped: (from: string, to: string, stints: number) =>
      `Streckentemperatur über ${stints} Stints von ${from} °C → ${to} °C verlaufen.`,
    tempRampedPeak: (from: string, peak: string, at: number, to: string, stints: number) =>
      `Streckentemperatur über ${stints} Stints von ${from} → ${peak} °C bei Stint ${at} → ${to} °C verlaufen.`,

    galleryMax: (max: number) => `Nur ${max} Bilder pro Plan.`,
    gallerySkipped: (names: string) => `Übersprungen: ${names}.`,
    posterSaved: "Poster beim Plan gespeichert.",
    picturesAdded: (n: number) => `${n} Bild${n === 1 ? "" : "er"} hinzugefügt.`,

    savedCopied: "Gespeichert — Link zum Teilen in die Zwischenablage kopiert.",
    savedNoClipboard: "Gespeichert. Der Link zum Teilen steht in der Adresszeile.",
  },
  msgPull: {
    noDates: " · die Runden tragen kein Datum, daher griff nur der Saisonfilter",
    addedToPool: (laps: number, imports: number) =>
      ` · zum Pool hinzugefügt: ${laps} Runden aus ${imports} Import${imports === 1 ? "" : "en"}`,
    replacedDuplicate: " (dieser Abruf hat einen identischen früheren ersetzt)",
    dropped: (names: string) => ` · entfernt: ${names}`,
    reviewThenApply: ". Unten prüfen, dann in den Plan übernehmen.",
    reviewThenApplySpaced: " Unten prüfen, dann in den Plan übernehmen.",
  },
  index: {
    title: "Stint Planner",
    lead:
      "Sprit-, Stint- und Fahrerwechsel-Pläne für iRacing Special Events. Du siehst die Pläne, die du erstellt hast, die, in denen du fährst, und die, zu denen du hinzugefügt wurdest.",
    guide: "📖 Anleitung",
    newPlan: "+ Neuer Plan",
    emptyPre: "Noch keine Stint-Pläne für dich.",
    emptyLink: "Leg den ersten an →",
    activeTitle: "Aktive Pläne",
    activeEmptyPre: "Gerade läuft nichts —",
    activeEmptyLink: "starte einen neuen Plan",
    completedTitle: "Abgeschlossen",
    completedLead:
      "Gefahrene Rennen. Der Plan ist schreibgeschützt, die Auswertung bleibt offen — öffne einen und mach ihn wieder auf, wenn du etwas ändern musst.",
    completedBadge: "abgeschlossen",
    driverCount: (n: number) => `${n} Fahrer`,
    noAccessTitle: "Dieser Plan ist nicht für dich freigegeben",
    noAccessBodyPre:
      "Einen Stint-Plan können nur der Fahrer öffnen, der ihn erstellt hat, die Fahrer darin, die von ihnen hinzugefügten Personen und CLS-Admins. Wenn du dabei sein solltest, bitte denjenigen, der den Plan gebaut hat, dich hinzuzufügen — auf seiner Seite gibt es einen Kasten",
    noAccessBox: "Wer diesen Plan öffnen kann",
    noAccessBodyPost: ".",
    backToPlans: "← Deine Stint-Pläne",
  },
  page: {
    allPlans: "← Alle Stint-Pläne",
    newTitle: "Neuer Stint-Plan",
    newLead:
      "Sprit, Stints und Fahrerwechsel für ein iRacing Special Event. Trag Renndauer, Rundenzeit, Verbrauch pro Runde und Tankgröße ein — füg Fahrer aus CLS hinzu, weis jedem Stint einen zu und speicher. Der gespeicherte Plan gehört dir: du, die Fahrer darin und alle, die du hinzufügst, können ihn öffnen.",
    planTitle: "Endurance Stint Planner",
    planLeadArchived:
      "Abgeschlossener Plan — das Rennen ist gefahren, der Plan selbst ist eingefroren. Die Auswertung darunter bleibt offen.",
    planLeadLive:
      "Geteilter Stint-Plan — live für alle Beteiligten. Änderungen werden automatisch gespeichert, und die Ansicht aller aktualisiert sich innerhalb weniger Sekunden.",
    debriefLink: "De-Briefing fürs Team →",
  },
  access: {
    title: "🔒 Wer diesen Plan öffnen kann",
    count: (n: number) => `${n} ${n === 1 ? "Person" : "Personen"} + Admins`,
    hide: "ausblenden",
    show: "anzeigen",
    lead:
      "Ein Stint-Plan ist privat. Der Fahrer, der ihn erstellt hat, alle in der Aufstellung und die unten hinzugefügten Personen können ihn öffnen und bearbeiten — sonst niemand, auch nicht mit dem Link. CLS-Admins kommen immer rein.",
    createdBy: "Erstellt von",
    ownerUnknown:
      "Nicht festgehalten — dieser Plan ist älter als die Zugriffsregeln. Die Fahrer darin (und Admins) können ihn öffnen.",
    driversTitle: "Fahrer im Plan",
    driversEmpty:
      "Noch keine CLS-Fahrer in der Aufstellung — füg unten im Planer Fahrer hinzu, dann bekommen sie automatisch Zugriff.",
    extraTitle: "Zusätzlich zugelassen",
    extraEmpty: "Noch niemand.",
    removePerson: (name: string) => `${name} entfernen`,
    addPlaceholder: "Jemanden hinzufügen, der nicht fährt…",
    add: "Hinzufügen",
    addNote: "Teamchef, Spotter, Ingenieur — dieselben Rechte wie ein Fahrer.",
  },
  gallery: {
    posterTitle: "Ergebnis-Poster / Urkunde",
    uploading: "Lädt hoch…",
    replacePoster: "Poster ersetzen",
    uploadPoster: "Poster hochladen",
    posterAlt: "Ergebnis-Poster",
    captionPlaceholder: "Bildtext (optional) — z. B. P8 in der Klasse, LMP2",
    captionShort: "Bildtext…",
    remove: "Entfernen",
    posterEmpty:
      "Lade die offizielle Urkunde oder euer eigenes Ergebnis-Poster hoch — es bleibt beim Plan, und jeder mit dem Link sieht es.",
    impressionsTitle: "Eindrücke vom Rennen",
    limitReached: (max: number) => `Grenze von ${max} erreicht`,
    addPictures: "Bilder hinzufügen",
    fullSize: "Volle Größe",
    closeEsc: "Schließen (Esc)",
    duplicate: "Duplizieren",
    duplicating: "Kopiert…",
    duplicateHint:
      "Kopiert diesen Plan — gleiches Setup, gleiche Fahrer und Boxenwerte, leerer Zeitplan.",
    deletePlan: "Löschen",
    deleting: "Löscht…",
    deleteHint: "Diesen Plan löschen (nur Admins)",
    deleteConfirm: (title: string) =>
      `„${title}“ löschen? Das lässt sich nicht rückgängig machen.`,
  },
  perf: {
    title: "Fahrerleistung",
    cleanLaps: (n: number) => `${n} saubere Runden`,
    tempFit: (per10: string) => ` · Fit ${per10} s/10°C`,
    colDriver: "Fahrer",
    colLaps: "Runden",
    colBest: "Beste",
    colMedian: "Median",
    colGap: "Δ zur schnellsten",
    colConsistency: "Konstanz (σ)",
    colFuel: "Verbrauch/Rd.",
    fastest: "schnellste",
    wetTitle: "Nasse Bedingungen",
    wetSummary: (laps: number, min: number, max: number, delta: string) =>
      `${laps} Nassrunden · ${min}–${max}% nass${delta}`,
    wetDelta: (sec: string) => ` · +${sec}s/Runde gegenüber trocken`,
    colWetLaps: "Nassrunden",
    colWetPace: "Nass-Pace",
    wetNote:
      "Nass-Pace schwankt stark (Linie, stehendes Wasser, Reifen) — nur als grober Anhaltspunkt. Nutz den Trocken/Nass-Schalter im Event, um das Rennen mit Nass-Pace neu zu planen.",
    paceTitle: "Pace & Konstanz",
    paceNote: (temp: string) =>
      `Kasten = mittlere 50 % der Runden, Linie = Median, Punkt = beste. Schmalerer Kasten = konstanter. Normiert auf ${temp}.`,
    paceNoteOneTemp: "eine Temperatur",
    fuelTitle: "Verbrauch pro Runde",
    fuelNote:
      "Median-Verbrauch auf sauberen Runden — weniger kann einen Boxenstopp sparen.",
    scatterTitle: "Rundenzeit über Streckentemperatur",
    scatterEmpty:
      "Noch nicht genug Runden über verschiedene Streckentemperaturen, um den Zusammenhang zu zeichnen.",
    scatterNote: (trend: string) =>
      `Jeder Punkt ist eine saubere Runde, dargestellt als Abstand zum eigenen Median des Fahrers — so überlagern sich die Fahrer. Gestrichelte Linie = der gefittete Temperaturtrend${trend}.`,
    scatterTrend: (per10: string) => ` (${per10} s/10°C)`,
  },
  rlog: {
    noLapData: "Keine Rundendaten für unser Auto in diesem Log.",
    planDisagreesTitle: "Der Stint-Plan passt nicht zu dem, was iRacing gewertet hat.",
    planDisagreesBody: (driver: string, delta: number | string) =>
      `Nach dem Plan hätte ${driver} ${delta} Runden mehr oder weniger, als das Ergebnis ihm zuschreibt — genau so sieht ein getauschter Stint aus, wenn jemand für einen Teamkollegen eingesprungen ist und der Plan nie geändert wurde. Die Fahrer unten kommen deshalb aus dem ERGEBNIS, nicht aus dem Plan. Wenn das immer noch falsch ist, setz den Fahrer in der Stint-Tabelle von Hand.`,
    aDriver: "ein Fahrer",
    overridden: (n: number) =>
      `${n} Stint${n === 1 ? "" : "s"} von Hand zugewiesen — die schlagen sowohl den Plan als auch die Rekonstruktion.`,
    teamEventTitle: "Team-Rennen.",
    teamEventPre: "Runden, beste Runde, Schnitt und Incidents kommen aus der",
    teamEventMid:
      "— iRacings eigener Wertung pro Fahrer. Der Race Logger hält pro Auto nur einen Fahrernamen fest, wer welchen Stint gefahren ist, kommt deshalb aus",
    teamEventPlanBold: "deinem Stint-Zeitplan oben",
    teamEventPlanPost:
      "— jeder echte Stint wird dem geplanten Stint zugeordnet, mit dem er sich zeitlich am meisten überschneidet, live-±-Korrekturen eingerechnet.",
    teamEventInferredPre: "einer",
    teamEventInferredEm: "Rekonstruktion",
    teamEventInferredPost:
      "aus der schnellsten Runde und der Rundenzahl jedes Fahrers. Weis die Fahrer im Stint-Zeitplan oben zu, dann wird es exakt.",
    notConfident:
      "Die Rekonstruktion hat nicht bei jedem Fahrer die Rundenzahl exakt getroffen — behandle die Stint-Zuordnung als beste Schätzung.",

    bestLap: "beste Runde",
    laps: "Runden",
    average: "Schnitt",
    cleanAvg: "Ø sauber",
    cleanAvgHint:
      "Schnitt nur über die Rennrunden dieses Fahrers — die Runde in die Box und die Runde wieder heraus bleiben draußen, damit ein Doppelstint und ein Reparaturstopp einen Fahrer nicht langsam aussehen lassen.",
    cleanCell: (kept: number, dropped: number, why: string) =>
      `${kept} Rennrunden, ${dropped} ignoriert${why ? ` (${why})` : ""}`,
    cleanCellNone: "Nach Abzug der In-/Out-Laps bleiben keine Rennrunden übrig",
    incidents: "Incidents",
    greenPace: "Grün-Pace",
    target: (iRating: number | string) => `Ziel (${iRating} iR)`,
    targetHint: (iRating: number | string) =>
      `Von der Pace-Kurve beim eigenen iRating von ${iRating} abgelesen.`,
    spread: "Streuung",
    stints: "Stints",
    footnotePlan:
      "* aus dem Log gemessen, aufgeteilt nach der Fahrerreihenfolge deines Stint-Zeitplans.",
    footnoteInferred: "* aus der rekonstruierten Stint-Aufteilung abgeleitet.",

    gapBest: "Beste Runde — Abstand zur Klassenbestzeit",
    gapAvgTarget: "Schnitt — Abstand zum Ziel des eigenen iRatings",
    gapAvg10k: "Schnitt — Abstand zur 10k-Referenz",
    gapAvgClass: "Schnitt — Abstand zur Klassenbestzeit",
    noteTemp: (
      baseTemp: string,
      slope: string,
      corrected: number,
      skipped: string,
      source: string
    ) =>
      `Nur Rennrunden, danach jede Runde auf ${baseTemp} °C verschoben, mit den im Plan gemessenen ${slope} s pro Grad — so lässt sich der Fahrer des heißen Startstints mit dem der kühlen Nacht vergleichen. ${corrected} Runden korrigiert${skipped}. Die Temperaturen kommen aus ${source}.`,
    noteTempSkipped: (n: number) => `, ${n} ohne Temperaturangabe ausgelassen`,
    noteTempFromLog: "den eigenen Messwerten des Race Loggers",
    noteTempFromPlan: "den an der Boxenmauer eingetragenen Werten pro Stint",
    noteCleanMarked: (dropped: string) =>
      `Schnitt nur über Rennrunden — Formations- und Startrunde, die Runde in die Box und wieder heraus, jede Runde unter Full Course Yellow und die Restartrunde danach bleiben alle draußen${dropped}. Ein einzelnes geschwenktes Gelb ist keine Caution und streicht keine Runde.`,
    noteCleanDropped: (n: number, why: string) =>
      ` (${n} Runden${why ? `: ${why}` : ""})`,
    noteCleanOld: (dropped: string) =>
      `Schnitt über die Rennrunden: die Runde in die Box und wieder heraus werden ignoriert${dropped}. Dieses Log wurde ausgewertet, bevor Formations-, Start- und Full-Course-Yellow-Runden erkannt wurden — drück oben auf Neu auswerten, um auch die anzuwenden.`,
    noteCleanOldDropped: (n: number) => ` (${n} Runden)`,
    noteIracing:
      "iRacings Schnitt über jede vom Fahrer gefahrene Runde — Boxen-, Caution- und Reparaturrunden sind also drin.",
    cycleHintTemp:
      "Durchschalten: sauberer Schnitt → auf eine Streckentemperatur korrigiert → iRacings eigener Schnitt.",
    cycleHintNoTemp:
      "Wechselt zwischen dem sauberen Schnitt (ohne In-/Out-Laps) und iRacings eigenem Schnitt. Ein temperaturkorrigierter Schnitt braucht eine gemessene °C-Steigung im Plan.",
    modeTemp: "Ø temperaturkorrigiert",
    modeIracing: "iRacing Ø",
    extraTargets: (ref: string) =>
      `Jeder Balken ist der eigene Maßstab des Fahrers: die Rundenzeit, die sein iRating hier wert war, von der Pace-Kurve abgelesen. Ein kurzer Balken heißt, er ist über seinem Rating gefahren${ref}.`,
    extraTargetsRef: (lap: string) =>
      `; die feste 10k-Referenz für diese Strecke ist ${lap}`,
    extraNoRatings:
      "Noch keine iRatings in der Ergebnisdatei — lade die eventresult.json hoch, dann bekommt jeder Fahrer sein eigenes Ziel. Bis dahin gilt für alle die feste Referenz (oder die Klassenbestzeit).",
    extraNoCurve:
      "Für diesen Plan ist keine Pace-Kurve gewählt, alle werden also an derselben Zahl gemessen. Wähl in der Event-Karte eine aus, um Ziele pro Fahrer zu bekommen.",
    lapsDriven: "Gefahrene Runden",
    incPerStint: "Incidents pro Stint",
    incPerStintNote:
      "Die Balkenlänge ist Incidents ÷ Stints. Rohe Summen zu vergleichen bestraft den, der am längsten im Auto saß — ein Fahrer mit vier Stints und 4x ist genauso sauber wie einer mit zwei Stints und 2x.",
    incUnknownStints: (inc: number) => `${inc}x — Stints unbekannt`,
    incRate: (rate: string, inc: number, stints: number) =>
      `${rate}/Stint — ${inc}x in ${stints} Stint${stints === 1 ? "" : "s"}`,
    incNone: "Keine Incidents — sauberes Rennen.",
    incNotRecorded:
      "Nicht erfasst. Dieses Log enthält keine Incident-Daten — der Race Logger nimmt Incidents aus dem Broadcast-Dashboard, und das lief nicht. Lade die eventresult.json für iRacings eigene Zählung hoch, oder nutz einen neueren RaceLogger, der die Zahl selbst liest.",

    traceTitle: "Rundenzeiten über das Rennen",
    badgeFromPlan: "Fahrer aus dem Stint-Plan",
    badgeReconstructed: "Stint-Aufteilung rekonstruiert",
    aboveScale: (n: number) =>
      `${n} Runde${n === 1 ? "" : "n"} über der Skala (Box / Caution)`,
    allInScale: "alle Runden in der Skala",
    classBest: "Klassenbestzeit",
    traceAria: "Rundenzeit pro Runde für jeden Team-Fahrer",
    hoverLap: (lap: number) => `Runde ${lap}`,
    unassigned: "nicht zugeordnet",
    vsClassBest: "zur Klassenbestzeit",

    noComparable: "Keine vergleichbaren Rundenzeiten.",
    gapTo: (name: string, gap: string, baseline: string) =>
      `${name}: ${gap} s auf ${baseline}`,
    baselineTarget: (iRating: number | string, lap: string) =>
      `Ziel für ${iRating} iR (${lap})`,
    baseline10k: (lap: string) => `10k-Referenz (${lap})`,
    baselineClass: (lap: string) => `Klassenbestzeit (${lap})`,

    stintTableTitle: "Stint für Stint",
    stintTableCar: (n: string) => ` — Auto #${n}`,
    badgePlanShort: "Fahrer aus dem Plan",
    badgeReconstructedShort: "Fahrer rekonstruiert",
    stintBarNote:
      "Balkenlänge = Stint-Pace relativ zu unserem besten und schlechtesten Stint",
    colNum: "#",
    colLaps: "Runden",
    colDriver: "Fahrer",
    colStintPace: "Stint-Pace",
    colPit: "Box",
    stintDriverHint:
      "Wer diesen Stint wirklich gefahren ist. Nur setzen, wenn die automatische Antwort falsch ist — eine Handkorrektur schlägt Plan und Rekonstruktion und wird beim Plan gespeichert.",
    autoDriver: (name: string) => `automatisch — ${name}`,
    autoUnknown: "automatisch — unbekannt",
    stintPaceHint: (index: number, lap: string) => `Stint ${index}: ${lap}`,

    exFormStart: (n: number) => `${n} Formations-/Startrunde`,
    exInOut: (n: number) => `${n} In-/Out-Lap`,
    exFcy: (n: number) => `${n} unter Full Course Yellow`,
    exRestart: (n: number) => `${n} Restartrunde`,
  },
  dbf: {
    title: "De-briefing",
    pptx: "⬇ PowerPoint (.pptx)",
    print: "Drucken / PDF",
    refreshHistory: "Historie aktualisieren",
    saving: "Speichere…",
    historyRefreshed: (drivers: number) => `Historie aktualisiert (${drivers} Fahrer).`,

    awardsTitle: "Auszeichnungen (schnell und sicher)",
    evalTitle: "Auswertung",
    colDriver: "Fahrer",
    colAllVsClean: "gesamt vs. clean",
    colAllVsPlan: "gesamt vs. Prognose",
    colCleanVsBest: "clean vs. Best",
    colBestVsRef: "beste Runde vs. Referenz",
    colIncPerHour: "Incs/h",
    colRelPerf: "Relativperformance",
    col10k: "10k-Performance",
    colConsistency: "Konstanz",
    legendRelPerf: "Relativperformance",
    legendRelPerfBody:
      "= die Rundenzeit, die das eigene iRating hier wert war, geteilt durch die tatsächlich gefahrene beste Runde — über 100 % heißt schneller als das eigene Rating.",
    legend10k: "10k-Performance",
    legend10kBody:
      "misst dasselbe gegen die feste 10k-Referenzrunde und ist damit über Rennen hinweg vergleichbar.",
    legendConsistency: "Konstanz",
    legendConsistencyBody:
      "= 1 − σ ÷ Ø über die sauberen Runden, je Fahrer gegen die eigenen Runden gemessen, nie Fahrer gegen Fahrer.",
    legendIncs: "Incs/h",
    legendIncsBody:
      "statt Incidents gesamt, damit nicht bestraft wird, wer die meisten Stints übernommen hat.",

    trendRelTitle: "Relativperformance im Verlauf",
    trendConsistencyTitle: "Konstanz im Verlauf",
    trendSeasonTitle: "Verlauf über die Saison",
    trendEmpty:
      "Noch keine Historie. Sie entsteht, sobald ein Plan als abgeschlossen markiert wird — oder sofort über „Historie aktualisieren“ oben.",
    trendOne:
      "Ein Rennen ist in der Historie. Ab dem zweiten wird hier eine Kurve daraus.",
    trendScale: (min: string, max: string) =>
      `Gleiche Skala in allen Feldern (${min} – ${max}). Rennen von links nach rechts:`,

    appendixTitle: "Anhang — die Rohdaten",
    colAvgAll: "Ø gesamt",
    colAvgClean: "Ø clean",
    colForecast: "Prognose",
    colBestLap: "beste Runde",
    colReference: "Referenz",
    colLaps: "Runden",
    colStints: "Stints",
    colDriveTime: "Fahrzeit",
    colIncs: "Incs",
    colIRating: "iRating",
    appendixRefPre: "Referenz =",
    appendixRefOfficial:
      "die Rundenzeit des eigenen iRatings aus der Pace-Kurve, sonst die feste 10k-Referenz",
    appendixRefLeague: "die schnellste Runde der eigenen Klasse",
    appendixAttrPre: ". Die Zuordnung der Stints stammt",
    appendixAttrPlan: "aus dem Stintplan",
    appendixAttrLog: "aus dem Race-Log selbst",
    appendixAttrInferred: "aus einer Rekonstruktion der Ergebnisse",

    discussionTitle: "Diskussion",
    discussionEmpty:
      "Noch keine Notizen. Die Post-Race-Notes des Plans erscheinen hier — und die PowerPoint bringt eine leere Diskussionsfolie mit den Stichworten mit.",

    baselineIrating: (iRating: number | string) => `Zielzeit für ${iRating} iR`,
    baselineRef10k: "feste 10k-Referenz",
    baselineClassBest: "schnellste Runde der Klasse",
    baselineTeamBest: "schnellste Runde des Teams",

    metricIncPerHour: "Incidents pro Stunde",
    noData: "keine Daten",

    teamCountsFor: "Zählt zur Team-Statistik von ",
    teamNone: "keinem Team",
    teamNoneNote: "— keiner der Fahrer ist in CLS einem Team zugeordnet.",
    teamInferred: (votes: number, matched: number) =>
      `automatisch aus den Fahrern (${votes} von ${matched})`,
    teamManual: "von Hand gesetzt",
    teamCancel: "Abbrechen",
    teamChange: "Team ändern",
    teamAuto: "Automatisch aus den Fahrern",
    teamSaved: (team: string) =>
      `Gespeichert${team ? ` — jetzt ${team}` : ""}. Seite neu laden, um es überall zu sehen.`,
  },
  dbfRace: {
    lapTraceTitle: "Rundenzeiten über das Rennen",
    timelineTitle: "Stintplan gegen Wirklichkeit",
    stintByStintTitle: "Stint für Stint",
    noLapTimes: "Keine Rundenzeiten im Log.",
    reasonForm: "Einführungsrunde",
    reasonStart: "Startrunde",
    reasonIn: "Einfahrt Box",
    reasonOut: "Ausfahrt Box",
    reasonFcy: "Gelbphase",
    reasonRestart: "Restart",
    excludedLegend: "aus der Wertung (Box, Gelb, Start)",
    classBestLegend: (lap: string) => `— — schnellste Runde der Klasse (${lap})`,
    hoverLap: (lap: number, time: string, why: string, at: string) =>
      `Runde ${lap}: ${time}${why}${at}`,
    hoverWhy: (why: string) => ` · ${why}`,
    hoverAt: (clock: string) => ` · bei ${clock}`,
    noSessionTimes:
      "Das Log trägt keine Sessionzeiten, deshalb lässt sich der Verlauf nicht gegen den Plan legen.",
    rowPlan: "Plan",
    rowActual: "Ist",
    timelineHover: (
      row: string,
      index: number,
      driver: string,
      from: string,
      to: string,
      laps: string,
      pit: string
    ) => `${row} · Stint ${index}${driver} · ${from}–${to}${laps}${pit}`,
    timelineDriver: (name: string) => ` · ${name}`,
    timelineLaps: (n: number) => ` · ${n} Runden`,
    timelinePit: (sec: string) => ` · Stopp ${sec} s`,
    timelineNote:
      "Oben der Stintplan (blasser), unten der tatsächliche Verlauf aus dem Race-Log. Die grauen Streifen sind die Boxenstopps mit ihrer Standzeit.",
    timelineMissing: (missing: number, total: number) =>
      `${missing} von ${total} Stints tragen im Log keine Sessionzeit und fehlen deshalb in der unteren Reihe — in der Tabelle unten stehen sie vollständig.`,
    avgPerStint: "Ø Rundenzeit je Stint",
    avgPerStintAria: "Durchschnittliche Rundenzeit je Stint",
    avgPerStintHover: (index: number, driver: string, lap: string) =>
      `Stint ${index}${driver}: ${lap}`,
    deltaPerStint: "Abweichung zur Prognose je Stint (Sekunden pro Runde)",
    deltaPerStintAria: "Abweichung zur Prognose je Stint",
    deltaNoDrivers: "Der Plan enthält für diese Stints keine Fahrerzuordnung.",
    deltaHover: (index: number, delta: string) =>
      `Stint ${index}: ${delta} s/Runde gegen Plan`,
    deltaNote: "Nach oben = langsamer als geplant, nach unten = schneller.",
    colStint: "Stint",
    colDriver: "Fahrer",
    colLaps: "Runden",
    colFromTo: "von–bis",
    colAvgLap: "Ø Rundenzeit",
    colBestLap: "beste Runde",
    colForecast: "Prognose",
    colDelta: "Abweichung",
    colIncidents: "Incidents",
    colPitStop: "Boxenstopp",
    incidentsNotTimed:
      "Incidents je Stint stehen nur zur Verfügung, wenn der Race Logger sie mit Zeitstempel aufgezeichnet hat. Dieses Log enthält keine — die Gesamtzahl je Fahrer in der Auswertung oben kommt aus dem eventresult, lässt sich aber keinem Stint zuordnen.",
  },

  dbfField: {
    boxTitle: (className: string) => `Klassenumfeld — ${className}`,
    classFallback: "Klasse",
    medianPre: "Unser Median lag bei",
    medianMid: (classMedian: string) => `, der Klassenmedian bei ${classMedian} —`,
    rank: (pos: number, of: number) => `, Platz ${pos} von ${of} in der Klasse nach Pace`,
    colNum: "#",
    colTeam: "Team",
    colMedian: "Median",
    colDeltaClass: "Δ Klasse",
    colBest: "Beste",
    colSpread: "Streuung",
    colStops: "Stopps",
    colAvgStop: "Ø Stopp",
    colLaps: "Runden",
    colPos: "Pos.",
    methodStops:
      "Stopps zählen erst ab 20 Sekunden Standzeit, kürzere Boxendurchfahrten bleiben draußen.",
    cautionNote:
      " Im gelben Band steht bewusst die tatsächlich gefahrene Pace: das Feld wird schon langsamer, bevor Race Control die Flagge wirft, und diese Runden gehören zum Rennen.",
    sharedNote: " Der Parse stammt aus dem Upload eines anderen Teams zum selben Rennen.",
    classMedian: "Klassenmedian",
    caution: "Gelbphase",
    minutes: (n: number) => `${n} min`,
    classLabel: "Klasse",
    byPace: "nach Pace",
    tooFewLaps:
      "Für unser Auto hat das Log zu wenige saubere Runden erfasst, um eine Median-Pace zu bilden.",
    methodNote:
      "Median der Rennrunden — Einführungs- und Startrunde, Ein- und Ausfahrtsrunden, Gelbphasen und Restarts sind nach denselben Regeln ausgeschlossen wie bei uns. Streuung ist p90 minus Median, also unempfindlich gegen die eine Runde im Kiesbett. Stopps zählen erst ab 20 s.",
    perCarNote:
      "Die Zahlen gelten je Auto, nicht je Fahrer: der Logger schreibt für jedes fremde Auto nur den Namen, der beim Session-Start darin saß.",
    windowAria: "Median je Zehn-Minuten-Fenster, unser Auto gegen die Klasse",
    ourCar: "unser Auto",
  },
  dbfPage: {
    noAccessTitle: "Dieses De-briefing ist nicht für dich freigegeben",
    noAccessBody:
      "Es gehört zu einem Stintplan, den nur der Ersteller, die eingetragenen Fahrer, die von ihm hinzugefügten Personen und CLS-Admins öffnen können.",
    backToPlan: "← Zurück zum Stintplan",
    noneTitle: "Noch kein De-briefing",
    noneBodyPre: "Für",
    noneBodyMid: "ist noch kein Race-Log hochgeladen. Lade die",
    noneBodyMid2: "des Race Loggers und — bei einem Teamrennen — die",
    noneBodyPost: "im Plan hoch, dann steht die Auswertung hier.",
    toPlan: "→ Zum Stintplan",
  },
  warn: {
    title: "Einen zweiten Blick wert",
    lead:
      "Nichts davon blockiert etwas — das sind nur Zahlen, die ungewöhnlich aussehen.",
    lapTimeShort: (lap: string) =>
      `Eine Rundenzeit von ${lap} ist für eine Langstreckenstrecke sehr kurz. Trag sie als m:ss.s ein — „1:58.8“, nicht „118.8“.`,
    lapTimeLong: (lap: string) =>
      `Eine Rundenzeit von ${lap} ist ungewöhnlich lang — prüf das Format (m:ss.s).`,
    fuelVsTank: (laps: string) =>
      `Bei diesem Verbrauch reicht der Tank etwa ${laps} Runden. Prüf Verbrauch pro Runde und Tankgröße gegeneinander.`,
    stintOverRace:
      "Ein Stint ist länger als das ganze Rennen — der Zeitplan besteht dann aus einem einzigen Stint.",
    reserveHigh:
      "Die Reserve frisst mehr als ein Fünftel des Tanks. Das ist viel verschenkte Reichweite.",
    noStops:
      "Der Plan kommt ganz ohne Boxenstopp aus. Bei dieser Renndauer steckt dahinter meist eine falsche Tankgröße oder ein falscher Verbrauch.",
    gridFuelHigh:
      "Für die Runde zum Grid ist mehr Sprit eingeplant, als eine normale Runde verbraucht — prüf die Liter.",
    fuelShortStints: (n: number) =>
      `${n} Stint${n === 1 ? "" : "s"} braucht mehr Sprit, als das Auto mitführt. Entweder wurden die Runden von Hand eingetragen, oder der Tank ist zu klein.`,
    tempWithoutModel:
      "Es ist eine Streckentemperatur gesetzt, aber nichts misst, wie die Rundenzeit darauf reagiert — die Pace wird also nicht angepasst. Hol Garage-61-Runden oder trag die s/10°C unter Event von Hand ein.",
  },
  jo: {
    fairShare: "Fair Share",
    fairShareHint:
      "Verteilt das Rennen gleichmäßig auf die Fahrer und markiert, wer deutlich unter seinem Anteil landet. Aus überlässt dir die Aufstellung vollständig.",
    marginLap: "Sicherheitsrunde",
    marginLapHint:
      "Plant jeden spritbegrenzten Stint eine Runde kürzer, als der Tank hergibt — es bleibt also immer eine Runde in der Hinterhand. Anders als die Liter-Reserve skaliert das mit dem Verbrauch: eine Runde bleibt eine Runde, ob das Auto im Nassen säuft oder nachts nippt.",
    iRating: "iRating",
    iRatingHint:
      "Das iRating dieses Fahrers, für ein Official-Rennen. Die Pace-Kurve macht daraus seine Zielrundenzeit. Vor dem Rennen gibt es keine Ergebnisdatei, aus der man es lesen könnte; ein späterer Upload überschreibt, was hier steht.",
    iRatingPlaceholder: "z. B. 4200",

    rainProfile: "Regen",
    rainProfileFallback: "Regen (Kader-Standard)",
    rainLead:
      "Pace UND Verbrauch bei voller Nässe. Eine nasse Runde ist langsamer und verbraucht deshalb weniger pro Runde — ohne das hat der Plan einen Nass-Stint mit dem Trocken-Verbrauch betankt und kam zu kurz. Halb nass nimmt die Hälfte von beidem. Leer lassen behält das alte Verhalten (nur Rundenzeit-Aufschlag).",
    rainActive: (delta: string, fuel: string) =>
      `Ein Nass-Stint läuft ${delta} s/Runde langsamer bei ${fuel} L/Runde.`,
    rainNeedsBoth:
      "Es braucht beide Hälften — eine nasse Rundenzeit ohne nassen Verbrauch ist das, was der Nass-Aufschlag schon gesagt hat.",

    colWet: "Nass +s",
    colWetHint:
      "Sekunden pro Runde, die DIESER Fahrer bei voller Nässe verliert, zusätzlich zu seiner eigenen Trockenpace. Leer = der Wert des Plans. Regen ist die größte Spreizung, die es zwischen zwei Fahrern mit gleicher Trockenpace gibt.",
    colHalfWet: "½ nass +s",
    colHalfWetHint:
      "Sekunden pro Runde, die DIESER Fahrer auf feuchter oder abtrocknender Strecke verliert. Leer = der Wert des Plans.",
    colTraffic: "Verkehr +s",
    colTrafficHint:
      "Sekunden pro Runde, die DIESER Fahrer im Renn-Verkehr verliert. Leer = der Wert des Plans. Sich durch Nachzügler zu fädeln ist Können wie alles andere.",
    colTempSlope: "s/10°C",
    colTempSlopeHint:
      "Wie stark sich die Rundenzeit DIESES Fahrers pro 10 °C Streckentemperatur verschiebt. Leer = die gemessene Steigung des Plans.",
    colTarget: "Ziel",
    colTargetHint:
      "Die Rundenzeit, die das eigene iRating dieses Fahrers hier wert ist, von der Pace-Kurve abgelesen. Wird nur bei einem Official-Rennen mit gewählter Kurve angezeigt.",

    colDouble: "Doppel",
    colDoubleHint:
      "Zwei Stints am Stück. „Gerne“ ist das, wonach die automatische Besetzung zuerst greift; „ok“ heißt: wenn der Plan es braucht; „lieber nicht“ ist die letzte Möglichkeit, bevor ein Stint leer bleibt.",
    colTriple: "Tripel",
    colTripleHint: "Drei Stints am Stück. Dieselben drei Antworten.",
    prefHappy: "gerne",
    prefOk: "ok",
    prefAvoid: "lieber nicht",
    maxRowLegacy: "Max. am Stück (alt)",
    maxRowLegacyHint:
      "Das alte einzelne Limit für Stints am Stück. Bleibt erhalten, weil Pläne von vor den Doppel-/Tripel-Spalten damit abgesegnet wurden; bei einem neuen Plan leer lassen.",

    fairShareOk: (laps: number) => `${laps} Runden — fairer Anteil`,
    fairShareLow: (laps: number, min: number) =>
      `${laps} Runden — unter dem Minimum von ${min} Runden für diesen Plan`,
    fairShareMinNote: (min: number, even: number) =>
      `Mindestens ${min} Runden pro Fahrer (ein Viertel des gleichen Anteils von ${even} Runden). Wer darunter liegt, wird markiert.`,

    targetsTitle: "Was eine Runde mehr kosten würde",
    targetsLead:
      "Womit der Plan gerade rechnet, und welchen Verbrauch es bräuchte, um noch eine Runde aus dem Tank zu holen. Nichts davon wird in den Plan übernommen — das sind Ziele zum Hinfahren, keine Werte, die gemessene ersetzen.",
    colLapsPerStint: "Runden/Stint",
    colNeeds: "Braucht",
    colSave: "Sparen",
    colStops: "Stopps",
    rowCurrent: "jetzt",
    unreachable: "jenseits des Spritspar-Profils",
    targetsSaves: (n: number) =>
      n === 0 ? "gleich viele Stopps" : `${n} Stopp${n === 1 ? "" : "s"} weniger`,
    targetsNone:
      "Trag Tankgröße und Verbrauch ein, um zu sehen, was ein längerer Stint bräuchte.",
    analysisDetails: "Vollständiger Stoppzahl-Durchlauf",

    easyPitNote:
      "Detaillierte Boxenwerte und der Garage-61-Import stehen im Erweitert-Modus.",
  },
  tabs: {
    basis: "Basisdaten",
    basisHint: "Event, Boxenstopp, Kader",
    prep: "Vorbereitung",
    prepHint: "Pace, Verbrauch, Fahrerwerte",
    during: "Zeitplan & Live",
    duringHint: "der Ablauf und wo das Rennen gerade steht",
    post: "Nach dem Rennen",
    postHint: "Ergebnis & Auswertung",
  },
  // <<SECTIONS>>
};
