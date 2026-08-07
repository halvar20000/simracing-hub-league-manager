import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Datenschutzerklärung / Privacy Policy",
  description:
    "Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 und 14 DSGVO auf league.simracing-hub.com.",
  url: "/datenschutz",
});

const LAST_UPDATED = "7. August 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-zinc-100">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">
        {children}
      </div>
    </section>
  );
}

export default function DatenschutzPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">
          Datenschutzerklärung / Privacy Policy
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Informationen nach Art. 13 und 14 DSGVO · Information under Articles
          13 and 14 GDPR · Stand / last updated: {LAST_UPDATED}
        </p>
        <nav className="mt-3 flex gap-3 text-xs">
          <a href="#de" className="text-[#ff6b35] hover:underline">
            Deutsch
          </a>
          <span className="text-zinc-600">·</span>
          <a href="#en" className="text-[#ff6b35] hover:underline">
            English
          </a>
          <span className="text-zinc-600">·</span>
          <Link href="/impressum" className="text-[#ff6b35] hover:underline">
            Impressum
          </Link>
        </nav>
      </div>

      {/* ------------------------------ DEUTSCH ------------------------------ */}
      <div id="de" className="scroll-mt-24 space-y-6">
        <h2 className="border-b border-zinc-800 pb-2 text-xl font-bold uppercase tracking-wide text-[#ff6b35]">
          Deutsch
        </h2>

        <Section title="1. Verantwortlicher">
          <address className="not-italic">
            Thomas Herbrig
            <br />
            62a rue du Rhin, 68680 Kembs, Frankreich
            <br />
            Telefon +33 6 37 45 79 27
            <br />
            E-Mail:{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>
          </address>
          <p>
            Ein Datenschutzbeauftragter ist nicht bestellt; die Voraussetzungen
            des Art. 37 DSGVO liegen nicht vor.
          </p>
        </Section>

        <Section title="2. Aufruf der Website (Server-Logs)">
          <p>
            Beim Aufruf dieser Website übermittelt Ihr Browser technische
            Daten, die der Hosting-Anbieter kurzzeitig in Server-Logs
            verarbeitet: IP-Adresse, Datum und Uhrzeit, aufgerufene
            Adresse, HTTP-Statuscode, übertragene Datenmenge, Referrer und
            Browser-/Gerätekennung (User-Agent). Diese Verarbeitung ist zur
            Auslieferung, Stabilität und Sicherheit der Website erforderlich.
          </p>
          <p>
            Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse
            am sicheren und störungsfreien Betrieb). Speicherdauer: kurzfristig
            im Rahmen der Server- und Container-Logs, in der Regel wenige Tage,
            danach automatische Überschreibung.
          </p>
        </Section>

        <Section title="3. Anmeldung mit Discord">
          <p>
            Eine Anmeldung ist ausschließlich über Discord möglich (OAuth 2.0).
            Bei der Anmeldung erhalten wir von Discord: Ihre Discord-Benutzer-ID,
            Ihren Benutzernamen bzw. Anzeigenamen, Ihre bei Discord hinterlegte
            E-Mail-Adresse, Ihr Profilbild sowie die Information, ob Sie
            Mitglied des CAS-Discord-Servers sind (Berechtigungsumfang
            <span className="font-mono"> identify email guilds</span>). Es wird
            nur diese Mitgliedschaft geprüft; Ihre übrigen Server, Nachrichten
            oder Kontakte werden nicht ausgelesen oder gespeichert.
          </p>
          <p>
            Zweck: Authentifizierung, Zuordnung Ihres Fahrerprofils,
            Rechtevergabe (Fahrer, Steward, Teamleitung, Administration) und
            Zugangsprüfung für ligainterne Bereiche. Rechtsgrundlage: Art. 6
            Abs. 1 lit. b DSGVO (Durchführung des Nutzungsverhältnisses und der
            Meisterschaftsteilnahme).
          </p>
          <p>
            Anbieter: Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG
            Schiphol, Niederlande, bzw. Discord Inc., San Francisco, USA. Für
            die Verarbeitung innerhalb von Discord ist Discord eigenständig
            verantwortlich; es gilt die Datenschutzerklärung von Discord.
          </p>
        </Section>

        <Section title="4. Fahrer-, Meisterschafts- und Ergebnisdaten">
          <p>Im Rahmen des Ligabetriebs verarbeiten wir insbesondere:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Stammdaten: Vor- und Nachname, Land, E-Mail-Adresse,
              Discord-Kennung, iRacing-Kundennummer (Customer ID);
            </li>
            <li>
              sportliche Daten: iRating, Safety Rating und Lizenzklasse
              (Momentaufnahme aus iRacing), Team, Fahrzeug, Startnummer,
              Klassen-/Pro-Am-Einstufung, Meldestatus, Warteliste,
              Nachrück-Einsätze, Zu- und Absagen (RSVP);
            </li>
            <li>
              Ergebnisdaten: Rennergebnisse, Positionen, Runden, Rundenzeiten,
              Incidents, Punkte, Streichresultate, Strafen und Strafpunkte,
              Fair-Play-Wertung, Auszeichnungen (z. B. Driver of the Day);
            </li>
            <li>
              Vorfallmeldungen: Ihre Meldung, beteiligte Fahrer, beschriebener
              Sachverhalt, verlinkte Video-/Beweismittel, Kommentare sowie die
              Entscheidungen der Rennleitung;
            </li>
            <li>
              organisatorische Vermerke der Administration, etwa der Status
              einer Startgebühr oder einer iRacing-Einladung.
            </li>
          </ul>
          <p>
            Zwecke: Durchführung, Wertung und Dokumentation der
            Meisterschaften, Anwendung des Reglements und Veröffentlichung der
            Ergebnisse. Rechtsgrundlagen: Art. 6 Abs. 1 lit. b DSGVO
            (Teilnahme an der Meisterschaft) sowie Art. 6 Abs. 1 lit. f DSGVO
            (berechtigtes Interesse an einer nachvollziehbaren, öffentlich
            überprüfbaren Wertung).
          </p>
          <p>
            <span className="text-zinc-300">Veröffentlichung:</span> Name,
            Land, Team, Fahrzeug, Startnummer, Ergebnisse, Strafen und
            Tabellenstände sind Kern einer öffentlichen Meisterschaft und
            deshalb ohne Anmeldung im Internet abrufbar. Rein interne Angaben —
            E-Mail-Adresse, Discord-Kennung, Verwaltungsvermerke, Details von
            Vorfallmeldungen — sind nicht öffentlich, sondern nur für die
            berechtigten Rollen (Rennleitung, Administration und je nach
            Vorgang die unmittelbar Beteiligten) sichtbar.
          </p>
        </Section>

        <Section title="5. Daten aus iRacing (Art. 14 DSGVO)">
          <p>
            Rennergebnisse werden aus den offiziellen Ergebnisdateien der
            iRacing-Sessions übernommen; iRating, Safety Rating und
            Lizenzklasse werden aus dem iRacing-Mitgliederbereich abgeglichen.
            Diese Daten stammen also nicht von Ihnen selbst, sondern von
            iRacing.com Motorsport Simulations, LLC (USA), und betreffen
            ausschließlich Fahrerinnen und Fahrer, die zu einer CAS-Liga
            gemeldet sind. Kategorien: Kundennummer, Anzeigename, Ergebnis-,
            Runden- und Incident-Daten sowie Ratings. Rechtsgrundlage: Art. 6
            Abs. 1 lit. b und lit. f DSGVO.
          </p>
        </Section>

        <Section title="6. Kontaktformular und E-Mail">
          <p>
            Über das Kontaktformular übermittelte Angaben (Kategorie,
            betroffene Seite, Nachricht) werden zusammen mit Ihrem Namen und
            Ihrer Kontoinformation per E-Mail an den Betreiber weitergeleitet
            und zur Bearbeitung Ihres Anliegens verwendet. Versanddienstleister
            ist Resend, Inc. (USA) als Auftragsverarbeiter. Rechtsgrundlage:
            Art. 6 Abs. 1 lit. b bzw. lit. f DSGVO. Speicherdauer: bis zur
            abschließenden Bearbeitung, längstens bis zum Wegfall des
            Bearbeitungszwecks.
          </p>
        </Section>

        <Section title="7. Benachrichtigungen über Discord">
          <p>
            Für organisatorische Mitteilungen — etwa Terminabfragen (RSVP),
            Nachrückangebote oder Hinweise der Rennleitung — kann ein
            Discord-Bot Nachrichten in Ligakanälen posten oder Ihnen eine
            Direktnachricht senden. Dabei werden Ihre Discord-Kennung und der
            Mitteilungsinhalt an Discord übermittelt. Rechtsgrundlage: Art. 6
            Abs. 1 lit. b und lit. f DSGVO.
          </p>
        </Section>

        <Section title="8. Race Logger und Stint-Planer">
          <p>
            Wer den optionalen Race Logger nutzt, erhält einen persönlichen
            Upload-Schlüssel. Damit übertragene Rennprotokolle enthalten
            Telemetrie- und Rundendaten der jeweiligen Session (z. B.
            Rundenzeiten, Boxenstopps, Verbrauch, Positionen) und werden Ihrem
            Fahrerprofil zugeordnet. Die Nutzung ist freiwillig; ohne Erzeugung
            eines Schlüssels findet keine Übertragung statt. Rechtsgrundlage:
            Art. 6 Abs. 1 lit. f DSGVO (Auswertung des Rennbetriebs, Driver of
            the Day), bei ausdrücklicher Freischaltung durch Sie zugleich Art.
            6 Abs. 1 lit. a DSGVO.
          </p>
        </Section>

        <Section title="9. Cookies">
          <p>
            Diese Website setzt ausschließlich technisch notwendige Cookies:
            ein Sitzungs-Cookie zur Aufrechterhaltung Ihrer Anmeldung sowie
            Cookies zum Schutz vor websiteübergreifender Anfragefälschung.
            Diese sind für den von Ihnen ausdrücklich gewünschten Dienst
            unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG bzw. Art. 82 der
            französischen Loi Informatique et Libertés) und daher nicht
            einwilligungspflichtig. Eine Analyse Ihres Nutzungsverhaltens,
            Werbe-Tracking, Profilbildung oder Weitergabe an Werbenetzwerke
            findet nicht statt.
          </p>
        </Section>

        <Section title="10. Rennaufzeichnungen (YouTube, Twitch)">
          <p>
            <span className="text-zinc-300">
              Beim bloßen Aufruf einer Seite werden keine Daten an YouTube oder
              Twitch übertragen.
            </span>{" "}
            Der Videoplayer auf den Rennseiten ist durch eine Zwei-Klick-Lösung
            geschützt: Zunächst wird nur ein lokaler Platzhalter angezeigt. Erst
            wenn Sie darin ausdrücklich auf „Load the … player“ klicken, wird
            der Player nachgeladen und Ihr Browser verbindet sich mit Google
            Ireland Ltd. / Google LLC (YouTube, ausgeliefert über
            youtube-nocookie.com) bzw. Twitch Interactive, Inc. (Amazon). Ab
            diesem Zeitpunkt werden mindestens Ihre IP-Adresse, die aufgerufene
            Seite und gegebenenfalls dort gesetzte Cookies verarbeitet; sind Sie
            bei diesen Diensten angemeldet, kann der Abruf Ihrem Konto
            zugeordnet werden. Auf diese Verarbeitung besteht kein Einfluss; sie
            erfolgt in eigener Verantwortung der genannten Anbieter.
          </p>
          <p>
            Rechtsgrundlage für das Laden des Players ist Ihre durch den Klick
            erteilte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO sowie § 25 Abs. 1
            TDDDG). Die Einwilligung gilt nur für das jeweilige Video und wird
            nicht gespeichert; beim nächsten Seitenaufruf erscheint wieder der
            Platzhalter. Klicken Sie nicht, findet keine Übermittlung statt.
          </p>
          <p>
            Auch die Vorschaubilder auf der Seite „Race Streams“ und in der
            Administration werden nicht direkt von YouTube oder Twitch geladen,
            sondern über einen Proxy auf unserem eigenen Server abgerufen. Ihr
            Browser kontaktiert dabei ausschließlich league.simracing-hub.com.
          </p>
        </Section>

        <Section title="11. Empfänger und Auftragsverarbeiter">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Hetzner Online GmbH, Gunzenhausen, Deutschland — Hosting und
              Datenbank (Server in der EU), Auftragsverarbeiter nach Art. 28
              DSGVO;
            </li>
            <li>
              Resend, Inc., USA — Versand von Benachrichtigungs- und
              Kontakt-E-Mails, Auftragsverarbeiter;
            </li>
            <li>
              Discord Netherlands B.V. / Discord Inc. — Anmeldung und
              Benachrichtigungen;
            </li>
            <li>
              iRacing.com Motorsport Simulations, LLC, USA — Quelle der
              Ergebnis- und Ratingdaten;
            </li>
            <li>
              Google Ireland Ltd. / Twitch Interactive, Inc. — ausschließlich
              dann, wenn Sie den Videoplayer einer Rennaufzeichnung aktiv
              starten (siehe Ziffer 10).
            </li>
          </ul>
          <p>
            Eine Weitergabe zu Werbezwecken oder ein Verkauf von Daten findet
            nicht statt.
          </p>
        </Section>

        <Section title="12. Übermittlung in Drittländer">
          <p>
            Soweit Daten an Anbieter in den USA übermittelt werden (Resend,
            Discord, iRacing, Google, Twitch), stützt sich die Übermittlung auf
            das EU-US Data Privacy Framework, soweit der jeweilige Anbieter
            zertifiziert ist, andernfalls auf Standardvertragsklauseln der
            Europäischen Kommission gemäß Art. 46 Abs. 2 lit. c DSGVO. Es kann
            nicht vollständig ausgeschlossen werden, dass Behörden in den USA
            auf dort gespeicherte Daten zugreifen.
          </p>
        </Section>

        <Section title="13. Speicherdauer">
          <p>
            Konto- und Kontaktdaten werden gespeichert, solange Ihr Konto
            besteht, und danach gelöscht oder anonymisiert. Sportliche
            Ergebnisse, Wertungen und Strafen bleiben als
            Meisterschaftshistorie erhalten, da eine nachträgliche Entfernung
            einzelner Ergebnisse die Wertung ganzer Saisons entwerten würde
            (berechtigtes Interesse, Art. 6 Abs. 1 lit. f DSGVO). Auf Wunsch
            kann Ihr Name in abgeschlossenen Saisons durch eine neutrale
            Kennung ersetzt werden.
          </p>
        </Section>

        <Section title="14. Ihre Rechte">
          <p>
            Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16),
            Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18),
            Datenübertragbarkeit (Art. 20) sowie das Recht, einer Verarbeitung
            auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO aus Gründen, die sich
            aus Ihrer besonderen Situation ergeben, jederzeit zu widersprechen
            (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit
            Wirkung für die Zukunft widerrufen.
          </p>
          <p>
            Wenden Sie sich dafür an{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>{" "}
            oder an das{" "}
            <Link href="/contact" className="text-[#ff6b35] hover:underline">
              Kontaktformular
            </Link>
            .
          </p>
          <p>
            Ihnen steht zudem ein Beschwerderecht bei einer
            Datenschutz-Aufsichtsbehörde zu (Art. 77 DSGVO). Zuständig ist
            aufgrund der Niederlassung des Verantwortlichen in Frankreich die
            CNIL (Commission Nationale de l&apos;Informatique et des Libertés,
            3 place de Fontenoy, 75007 Paris); Sie können sich aber auch an die
            Aufsichtsbehörde Ihres gewöhnlichen Aufenthaltsorts wenden.
          </p>
        </Section>

        <Section title="15. Keine automatisierte Entscheidungsfindung">
          <p>
            Punkte, Strafen und Tabellenstände werden nach dem jeweiligen
            Reglement automatisch berechnet. Entscheidungen mit rechtlicher
            Wirkung oder ähnlich erheblicher Beeinträchtigung im Sinne des Art.
            22 DSGVO — insbesondere Strafen nach einer Vorfallmeldung — trifft
            stets die Rennleitung als Mensch.
          </p>
        </Section>

        <Section title="16. Änderungen">
          <p>
            Diese Erklärung wird angepasst, wenn sich die Funktionen der
            Website oder die Rechtslage ändern. Es gilt jeweils die hier
            veröffentlichte Fassung.
          </p>
        </Section>
      </div>

      {/* ------------------------------ ENGLISH ------------------------------ */}
      <div id="en" className="scroll-mt-24 space-y-6">
        <h2 className="border-b border-zinc-800 pb-2 text-xl font-bold uppercase tracking-wide text-[#ff6b35]">
          English
        </h2>

        <Section title="1. Controller">
          <address className="not-italic">
            Thomas Herbrig
            <br />
            62a rue du Rhin, 68680 Kembs, France
            <br />
            Phone +33 6 37 45 79 27
            <br />
            Email:{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>
          </address>
          <p>
            No data protection officer has been appointed; the conditions of
            Art. 37 GDPR are not met.
          </p>
        </Section>

        <Section title="2. Visiting the site (server logs)">
          <p>
            When you open this website your browser transmits technical data
            which the hosting provider processes briefly in server logs: IP
            address, date and time, requested address, HTTP status code, data
            volume, referrer and user agent. This is necessary to deliver the
            site and keep it stable and secure. Legal basis: Art. 6(1)(f) GDPR
            (legitimate interest in secure, reliable operation). Retention:
            short term within server and container logs, typically a few days,
            then overwritten automatically.
          </p>
        </Section>

        <Section title="3. Signing in with Discord">
          <p>
            Sign-in is only possible via Discord (OAuth 2.0). Discord provides
            us with your Discord user ID, username or display name, the email
            address held at Discord, your avatar, and whether you are a member
            of the CAS Discord server (scope
            <span className="font-mono"> identify email guilds</span>). Only
            that one membership is checked; your other servers, messages or
            contacts are never read or stored.
          </p>
          <p>
            Purpose: authentication, linking your driver profile, assigning
            roles (driver, steward, team leader, admin) and gating league-only
            areas. Legal basis: Art. 6(1)(b) GDPR (performance of the use
            relationship and championship participation).
          </p>
          <p>
            Provider: Discord Netherlands B.V., Schiphol Boulevard 195, 1118 BG
            Schiphol, Netherlands, and Discord Inc., San Francisco, USA.
            Discord is an independent controller for processing inside its own
            service.
          </p>
        </Section>

        <Section title="4. Driver, championship and result data">
          <p>To run the leagues we process in particular:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              master data: first and last name, country, email address, Discord
              identifier, iRacing customer ID;
            </li>
            <li>
              sporting data: iRating, Safety Rating and licence class (snapshot
              from iRacing), team, car, start number, class / Pro-Am rating,
              entry status, waiting list, fill-in appearances, RSVP responses;
            </li>
            <li>
              result data: race results, positions, laps, lap times, incidents,
              points, dropped scores, penalties and penalty points, Fair Play
              Rating, awards such as Driver of the Day;
            </li>
            <li>
              incident reports: your report, the drivers involved, the
              described events, linked video or evidence, comments and the
              stewards&apos; decisions;
            </li>
            <li>
              administrative notes, such as the status of an entry fee or an
              iRacing invitation.
            </li>
          </ul>
          <p>
            Purposes: running, scoring and documenting the championships,
            applying the regulations and publishing results. Legal bases: Art.
            6(1)(b) GDPR (championship participation) and Art. 6(1)(f) GDPR
            (legitimate interest in a transparent, publicly verifiable
            classification).
          </p>
          <p>
            <span className="text-zinc-300">Publication:</span> name, country,
            team, car, start number, results, penalties and standings are the
            core of a public championship and are therefore available online
            without signing in. Purely internal information — email address,
            Discord identifier, administrative notes, the details of incident
            reports — is not public and is visible only to the relevant roles
            (stewards, administrators and, depending on the case, the parties
            directly involved).
          </p>
        </Section>

        <Section title="5. Data obtained from iRacing (Art. 14 GDPR)">
          <p>
            Race results are taken from the official iRacing session result
            files; iRating, Safety Rating and licence class are synchronised
            from the iRacing members area. This data therefore does not come
            from you directly but from iRacing.com Motorsport Simulations, LLC
            (USA), and concerns only drivers entered in a CAS league.
            Categories: customer ID, display name, result, lap and incident
            data, and ratings. Legal basis: Art. 6(1)(b) and (f) GDPR.
          </p>
        </Section>

        <Section title="6. Contact form and email">
          <p>
            Information submitted through the contact form (category, page
            concerned, message) is forwarded by email to the operator together
            with your name and account details and used to handle your request.
            The sending service is Resend, Inc. (USA), acting as a processor.
            Legal basis: Art. 6(1)(b) or (f) GDPR. Retention: until your
            request has been dealt with.
          </p>
        </Section>

        <Section title="7. Notifications via Discord">
          <p>
            For organisational messages — attendance requests (RSVP), fill-in
            offers, steward notices — a Discord bot may post in league channels
            or send you a direct message. Your Discord identifier and the
            message content are transmitted to Discord for this purpose. Legal
            basis: Art. 6(1)(b) and (f) GDPR.
          </p>
        </Section>

        <Section title="8. Race Logger and stint planner">
          <p>
            If you use the optional Race Logger you receive a personal upload
            key. Race logs uploaded with it contain telemetry and lap data from
            the session (lap times, pit stops, fuel use, positions) and are
            linked to your driver profile. Use is voluntary; without generating
            a key nothing is transmitted. Legal basis: Art. 6(1)(f) GDPR
            (analysis of race operations, Driver of the Day) and, where you
            explicitly enable it, Art. 6(1)(a) GDPR.
          </p>
        </Section>

        <Section title="9. Cookies">
          <p>
            This site uses strictly necessary cookies only: a session cookie to
            keep you signed in and cookies protecting against cross-site
            request forgery. These are strictly necessary for the service you
            explicitly requested and therefore do not require consent. There is
            no analytics, no advertising tracking, no profiling and no sharing
            with ad networks.
          </p>
        </Section>

        <Section title="10. Race recordings (YouTube, Twitch)">
          <p>
            <span className="text-zinc-300">
              Simply opening a page transmits nothing to YouTube or Twitch.
            </span>{" "}
            The player on round pages is behind a click-to-load gate: at first
            only a local placeholder is shown. The player is loaded, and your
            browser connects to Google Ireland Ltd. / Google LLC (YouTube,
            served via youtube-nocookie.com) or Twitch Interactive, Inc.
            (Amazon), only once you explicitly click &quot;Load the … player&quot;.
            From that point at minimum your IP address, the page requested and
            any cookies set there are processed; if you are signed in to those
            services the request may be linked to your account. The operator has
            no influence over that processing, which those providers carry out
            under their own responsibility.
          </p>
          <p>
            The legal basis for loading the player is the consent you give by
            clicking (Art. 6(1)(a) GDPR). That consent covers only the video
            concerned and is not stored; the placeholder returns on your next
            visit. If you do not click, no transfer takes place.
          </p>
          <p>
            The preview images on the Race Streams page and in the admin area
            are likewise not loaded from YouTube or Twitch directly, but fetched
            through a proxy on our own server. Your browser only ever contacts
            league.simracing-hub.com.
          </p>
        </Section>

        <Section title="11. Recipients and processors">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Hetzner Online GmbH, Gunzenhausen, Germany — hosting and database
              (servers in the EU), processor under Art. 28 GDPR;
            </li>
            <li>
              Resend, Inc., USA — sending notification and contact emails,
              processor;
            </li>
            <li>
              Discord Netherlands B.V. / Discord Inc. — sign-in and
              notifications;
            </li>
            <li>
              iRacing.com Motorsport Simulations, LLC, USA — source of result
              and rating data;
            </li>
            <li>
              Google Ireland Ltd. / Twitch Interactive, Inc. — only if you
              actively start the player for a race recording (see section 10).
            </li>
          </ul>
          <p>Data is never sold or passed on for advertising purposes.</p>
        </Section>

        <Section title="12. Transfers to third countries">
          <p>
            Where data is transferred to providers in the USA (Resend, Discord,
            iRacing, Google, Twitch), the transfer relies on the EU-US Data
            Privacy Framework where the provider is certified, and otherwise on
            the European Commission&apos;s standard contractual clauses under
            Art. 46(2)(c) GDPR. Access by US authorities to data stored there
            cannot be entirely ruled out.
          </p>
        </Section>

        <Section title="13. Retention">
          <p>
            Account and contact data is kept for as long as your account
            exists and is deleted or anonymised afterwards. Sporting results,
            standings and penalties are retained as championship history, since
            removing individual results retroactively would invalidate the
            classification of entire seasons (legitimate interest, Art. 6(1)(f)
            GDPR). On request your name in completed seasons can be replaced
            with a neutral identifier.
          </p>
        </Section>

        <Section title="14. Your rights">
          <p>
            You have the right of access (Art. 15), rectification (Art. 16),
            erasure (Art. 17), restriction of processing (Art. 18), data
            portability (Art. 20), and the right to object at any time, on
            grounds relating to your particular situation, to processing based
            on Art. 6(1)(f) GDPR (Art. 21). Any consent given can be withdrawn
            at any time with effect for the future.
          </p>
          <p>
            To exercise these rights, write to{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>{" "}
            or use the{" "}
            <Link href="/contact" className="text-[#ff6b35] hover:underline">
              contact form
            </Link>
            .
          </p>
          <p>
            You also have the right to lodge a complaint with a supervisory
            authority (Art. 77 GDPR). As the controller is established in
            France, the competent authority is the CNIL (Commission Nationale
            de l&apos;Informatique et des Libertés, 3 place de Fontenoy, 75007
            Paris), but you may also contact the authority where you normally
            reside.
          </p>
        </Section>

        <Section title="15. No automated decision-making">
          <p>
            Points, penalties and standings are calculated automatically
            according to the applicable regulations. Decisions producing legal
            effects or similarly significant effects within the meaning of Art.
            22 GDPR — in particular penalties following an incident report —
            are always taken by human stewards.
          </p>
        </Section>

        <Section title="16. Changes">
          <p>
            This policy is updated when the site&apos;s functionality or the
            legal situation changes. The version published here applies.
          </p>
        </Section>
      </div>

      <p className="border-t border-zinc-800 pt-4 text-xs text-zinc-500">
        Siehe auch /{" "}
        <Link href="/impressum" className="text-[#ff6b35] hover:underline">
          Impressum / Legal Notice
        </Link>
      </p>
    </div>
  );
}
