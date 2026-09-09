"use client";

/**
 * Wraps a block that only exists in Advanced mode.
 *
 * The point of Easy mode is to shorten the page, not to change the plan: what
 * is hidden keeps computing exactly as before.
 *
 * Until v2.27.0 a hidden block that was CURRENTLY DOING SOMETHING left a quiet
 * line behind in Easy mode with a "Show advanced" button next to it. Thomas
 * had those removed: the Easy/Advanced switch sits in the top bar on every
 * page, and repeating it inside half the cards was noise. Nothing else
 * changed — hidden still means hidden, never altered.
 *
 * Printing always includes the block: paper is the pit-wall copy and must be
 * complete regardless of which mode the browser happened to be in.
 */

import { usePlannerUi } from "./PlannerUi";

export default function AdvancedOnly({
  children,
}: {
  children: React.ReactNode;
}) {
  const { advanced } = usePlannerUi();

  if (advanced) return <>{children}</>;

  return <div className="hidden print:block">{children}</div>;
}
