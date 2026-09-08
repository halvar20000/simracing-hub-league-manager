"use client";

/**
 * "?" beside a card heading, linking into the section of the manual that
 * covers it.
 *
 * The manual exists and is good; the problem was that reaching it meant going
 * back to the plan list, opening it and then finding the right section. One
 * click from the card that raised the question does that instead.
 *
 * The manual is written in German (it is the team's own document) and is not
 * translated, so the link says so when the interface is in English rather than
 * pretending otherwise.
 */

import { usePlannerUi } from "./PlannerUi";

/** The manual's own section anchors — see /stint-planner/anleitung. */
export type GuideSection =
  | "fahrer"
  | "aufbau"
  | "setup"
  | "pace"
  | "stints"
  | "live"
  | "danach"
  | "faq";

export default function GuideLink({ section }: { section: GuideSection }) {
  const { t, lang } = usePlannerUi();
  return (
    <a
      href={`/stint-planner/anleitung#${section}`}
      target="_blank"
      rel="noopener noreferrer"
      title={t.ui.guideHint}
      className="ml-1.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-[10px] font-semibold leading-none text-zinc-500 transition hover:border-orange-500/60 hover:text-orange-300 print:hidden"
      aria-label={lang === "de" ? t.ui.guide : `${t.ui.guide} (DE)`}
    >
      ?
    </a>
  );
}
