import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";
import CrLangSwitch from "@/components/CrLangSwitch";
import { getCrLang } from "@/lib/i18n/cas-rating-lang";
import { RegulationDe } from "./regulation-de";
import { RegulationEn } from "./regulation-en";

/** CAS Rating regulation, German (original) or English via the CR language cookie. */
export const metadata: Metadata = pageMetadata({
  title: "CAS Rating – Reglement / Rules",
  description:
    "Das CAS Rating (CR): eine Zahl von 0 bis 100 für jeden Fahrer der CAS Community. The CAS Rating: one number from 0 to 100 for every CAS driver.",
  url: "/cas-rating",
});
export const dynamic = "force-dynamic";

export default async function CasRatingPage() {
  const { lang } = await getCrLang();
  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16 leading-relaxed text-zinc-300">
      <div className="flex justify-end">
        <CrLangSwitch lang={lang} />
      </div>
      {lang === "en" ? <RegulationEn /> : <RegulationDe />}
    </div>
  );
}
