import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Impressum / Legal Notice",
  description:
    "Anbieterkennzeichnung nach § 5 DDG und mentions légales nach Art. 6 III LCEN für league.simracing-hub.com.",
  url: "/impressum",
});

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

export default function ImpressumPage() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Impressum / Legal Notice</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Angaben gemäß § 5 DDG und § 18 Abs. 2 MStV · Mentions légales selon
          l&apos;article 6 III de la loi n° 2004-575 (LCEN)
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
          <Link href="/datenschutz" className="text-[#ff6b35] hover:underline">
            Datenschutzerklärung
          </Link>
        </nav>
      </div>

      {/* ------------------------------ DEUTSCH ------------------------------ */}
      <div id="de" className="scroll-mt-24 space-y-6">
        <h2 className="border-b border-zinc-800 pb-2 text-xl font-bold uppercase tracking-wide text-[#ff6b35]">
          Deutsch
        </h2>

        <Section title="Diensteanbieter">
          <address className="not-italic">
            Thomas Herbrig
            <br />
            62a rue du Rhin
            <br />
            68680 Kembs
            <br />
            Frankreich
          </address>
        </Section>

        <Section title="Kontakt">
          <p>
            Telefon: +33 6 37 45 79 27
            <br />
            E-Mail:{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>
            <br />
            Kontaktformular:{" "}
            <Link href="/contact" className="text-[#ff6b35] hover:underline">
              league.simracing-hub.com/contact
            </Link>
          </p>
        </Section>

        <Section title="Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)">
          <p>Thomas Herbrig, Anschrift wie oben.</p>
        </Section>

        <Section title="Art des Angebots">
          <p>
            CLS (CAS League Scoring) ist ein privat betriebenes,
            nicht-kommerzielles Hobbyprojekt für die Sim-Racing-Community CAS.
            Es wird keine Gewinnerzielungsabsicht verfolgt. Es besteht keine
            Eintragung in ein Handels-, Vereins- oder Genossenschaftsregister,
            es liegt keine Umsatzsteuer-Identifikationsnummer vor und es gelten
            keine berufsrechtlichen Regelungen. Etwaige Startgebühren einer
            Meisterschaft werden nicht über diese Website erhoben oder
            abgewickelt; die Website bildet lediglich deren Status ab.
          </p>
        </Section>

        <Section title="Hosting">
          <p>
            Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen,
            Deutschland · Telefon +49 9831 505-0 ·{" "}
            <a
              href="https://www.hetzner.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff6b35] hover:underline"
            >
              hetzner.com
            </a>
            . Die Server stehen in der Europäischen Union.
          </p>
        </Section>

        <Section title="Verbraucherstreitbeilegung">
          <p>
            Der Betreiber ist nicht bereit und nicht verpflichtet, an
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
            teilzunehmen. Die Plattform der Europäischen Kommission zur
            Online-Streitbeilegung (OS-Plattform) wurde zum 20. Juli 2025
            eingestellt; ein Link darauf entfällt daher.
          </p>
        </Section>

        <Section title="Haftung für Inhalte">
          <p>
            Als Diensteanbieter ist der Betreiber gemäß § 7 Abs. 1 DDG für
            eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen
            verantwortlich. Nach §§ 8 bis 10 DDG besteht jedoch keine
            Verpflichtung, übermittelte oder gespeicherte fremde Informationen
            zu überwachen oder nach Umständen zu forschen, die auf eine
            rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung
            oder Sperrung der Nutzung von Informationen nach den allgemeinen
            Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist
            jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten
            Rechtsverletzung möglich. Bei Bekanntwerden entsprechender
            Rechtsverletzungen werden diese Inhalte umgehend entfernt.
          </p>
          <p>
            Ergebnisse, Wertungen, Strafen und Stewards-Entscheidungen werden
            nach bestem Wissen erfasst. Für ihre Richtigkeit, Vollständigkeit
            und Aktualität wird keine Gewähr übernommen; maßgeblich bleibt das
            jeweilige Reglement der Liga.
          </p>
        </Section>

        <Section title="Haftung für Links">
          <p>
            Dieses Angebot enthält Links zu externen Websites Dritter, auf
            deren Inhalte kein Einfluss besteht. Deshalb kann für diese fremden
            Inhalte auch keine Gewähr übernommen werden. Für die Inhalte der
            verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber
            der Seiten verantwortlich. Die verlinkten Seiten wurden zum
            Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft;
            rechtswidrige Inhalte waren nicht erkennbar. Bei Bekanntwerden von
            Rechtsverletzungen werden derartige Links umgehend entfernt.
          </p>
        </Section>

        <Section title="Urheberrecht">
          <p>
            Die durch den Betreiber erstellten Inhalte und Werke auf diesen
            Seiten unterliegen dem deutschen und französischen Urheberrecht.
            Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der
            Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der
            schriftlichen Zustimmung. Downloads und Kopien dieser Seite sind
            nur für den privaten, nicht kommerziellen Gebrauch gestattet.
            Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt
            wurden, werden die Urheberrechte Dritter beachtet und als solche
            gekennzeichnet.
          </p>
        </Section>

        <Section title="Marken- und Rechtehinweis">
          <p>
            iRacing ist eine Marke der iRacing.com Motorsport Simulations, LLC.
            Fahrzeug-, Hersteller-, Serien- und Streckenbezeichnungen sowie
            Team- und Sponsorenlogos sind Marken ihrer jeweiligen Inhaber und
            werden hier ausschließlich zur Beschreibung der virtuellen
            Meisterschaften verwendet. Es besteht keine Verbindung zu,
            Unterstützung durch oder Genehmigung seitens dieser Rechteinhaber.
          </p>
        </Section>
      </div>

      {/* ------------------------------ ENGLISH ------------------------------ */}
      <div id="en" className="scroll-mt-24 space-y-6">
        <h2 className="border-b border-zinc-800 pb-2 text-xl font-bold uppercase tracking-wide text-[#ff6b35]">
          English
        </h2>

        <Section title="Service provider / Publisher">
          <address className="not-italic">
            Thomas Herbrig
            <br />
            62a rue du Rhin
            <br />
            68680 Kembs
            <br />
            France
          </address>
          <p>
            Director of publication (directeur de la publication, Art. 6 III
            LCEN): Thomas Herbrig, address as above.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Phone: +33 6 37 45 79 27
            <br />
            Email:{" "}
            <a
              href="mailto:thomas.herbrig@gmail.com"
              className="text-[#ff6b35] hover:underline"
            >
              thomas.herbrig@gmail.com
            </a>
            <br />
            Contact form:{" "}
            <Link href="/contact" className="text-[#ff6b35] hover:underline">
              league.simracing-hub.com/contact
            </Link>
          </p>
        </Section>

        <Section title="Nature of this service">
          <p>
            CLS (CAS League Scoring) is a privately operated, non-commercial
            hobby project for the CAS sim racing community. It is not run for
            profit. There is no commercial or association register entry, no
            VAT identification number, and no regulated-profession rules apply.
            Any championship entry fees are neither collected nor processed
            through this website; the site only displays their status.
          </p>
        </Section>

        <Section title="Hosting provider (hébergeur)">
          <p>
            Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany ·
            Phone +49 9831 505-0 ·{" "}
            <a
              href="https://www.hetzner.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff6b35] hover:underline"
            >
              hetzner.com
            </a>
            . Servers are located in the European Union.
          </p>
        </Section>

        <Section title="Consumer dispute resolution">
          <p>
            The operator is neither willing nor obliged to take part in dispute
            resolution proceedings before a consumer arbitration board. The
            European Commission&apos;s Online Dispute Resolution platform was
            shut down on 20 July 2025, so no link to it is provided.
          </p>
        </Section>

        <Section title="Liability for content and links">
          <p>
            The operator is responsible for its own content on these pages
            under general law. There is no obligation to monitor transmitted or
            stored third-party information, or to investigate circumstances
            that indicate unlawful activity. Obligations to remove or block the
            use of information under general law remain unaffected; liability
            in this respect only arises from the point at which a concrete
            infringement becomes known. Such content will be removed promptly
            once notified.
          </p>
          <p>
            Results, standings, penalties and steward decisions are recorded to
            the best of the operator&apos;s knowledge. No warranty is given as
            to their accuracy, completeness or timeliness; the relevant league
            regulations always prevail.
          </p>
          <p>
            This site contains links to external third-party websites over
            whose content the operator has no influence. The respective
            provider or operator of the linked pages is always responsible for
            their content. Linked pages were checked for possible legal
            violations at the time of linking; unlawful content was not
            apparent. Such links will be removed promptly once an infringement
            becomes known.
          </p>
        </Section>

        <Section title="Copyright">
          <p>
            Content and works created by the operator on these pages are
            subject to German and French copyright law. Reproduction,
            adaptation, distribution and any kind of exploitation beyond the
            limits of copyright require written consent. Downloads and copies
            of this site are permitted for private, non-commercial use only.
            Where content on this site was not created by the operator, the
            copyright of third parties is respected and marked as such.
          </p>
        </Section>

        <Section title="Trademarks">
          <p>
            iRacing is a trademark of iRacing.com Motorsport Simulations, LLC.
            Car, manufacturer, series and track names as well as team and
            sponsor logos are trademarks of their respective owners and are
            used here solely to describe the virtual championships. No
            affiliation with, endorsement by, or approval from these rights
            holders is claimed or implied.
          </p>
        </Section>
      </div>

      <p className="border-t border-zinc-800 pt-4 text-xs text-zinc-500">
        Siehe auch /{" "}
        <Link href="/datenschutz" className="text-[#ff6b35] hover:underline">
          Datenschutzerklärung / Privacy Policy
        </Link>
      </p>
    </div>
  );
}
