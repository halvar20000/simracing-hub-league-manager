/**
 * iRacing pit-stop rule sets per car class (season 2026 S4).
 *
 * Source: the "rule-sets.png" table from the iRacing forums, sent by Johann
 * Solowej on 2026-11-27. It lists for every car class and rule set:
 *   - whether fuel and tyres are serviced one after the other or together,
 *   - when setup adjustments (ARB, wing, bodywork) are carried out,
 *   - how long a full tank takes to fill and how long four tyres take.
 *
 * Pure data + lookups, no prose: the UI turns the `adjust` codes into text
 * through the planner dictionaries. Update the table here when iRacing changes
 * the rules (new season = check the forum table again).
 */

export const PIT_RULESETS = ["default", "imsa", "nec", "dtm"] as const;
export type PitRuleset = (typeof PIT_RULESETS)[number];

/** When setup changes are carried out during a stop. */
export type PitAdjustRule =
  | "none" //                     N/A: no adjustments rule for this class
  | "bodyworkAfterTyres" //       bodywork changes AFTER tyre service is completed
  | "arbWingAfterFuelDuringTyres" // ARB + wing AFTER fuel service, DURING tyre service
  | "arbWingDuringService" //     ARB + wing DURING fuel and tyre service
  | "arbAfterFuelDuringTyres" //  ARB AFTER fuel service, DURING tyre service
  | "arbDuringService"; //        ARB DURING fuel and tyre service

export type PitRuleEntry = {
  /** Fuel and tyres together (true) or fuel first, then tyres (false). */
  parallel: boolean;
  adjust: PitAdjustRule;
  /** Seconds to fill a full (empty → full) tank; null = not known. */
  fillSec: number | null;
  /** Seconds to change all four tyres. */
  tyresSec: number;
};

export type PitRuleClass = {
  id: string;
  /** Name as the forum table writes it. */
  label: string;
  /** Lower-case fragments that identify this class in an iRacing car name. */
  match: string[];
  /** Per rule set; a missing rule set falls back to "default" in iRacing. */
  rules: Partial<Record<PitRuleset, PitRuleEntry>> & { default: PitRuleEntry };
};

const seq = (fillSec: number | null, tyresSec: number, adjust: PitAdjustRule = "none"): PitRuleEntry => ({
  parallel: false,
  adjust,
  fillSec,
  tyresSec,
});
const par = (fillSec: number | null, tyresSec: number, adjust: PitAdjustRule = "none"): PitRuleEntry => ({
  parallel: true,
  adjust,
  fillSec,
  tyresSec,
});

/** Small cars between Ruf C-Spec and Caterham: default/IMSA times + NEC 120 s fill. */
const club = (
  id: string,
  label: string,
  match: string[],
  fillSec: number,
  tyresSec: number
): PitRuleClass => ({
  id,
  label,
  match,
  rules: {
    default: seq(fillSec, tyresSec),
    imsa: par(fillSec, tyresSec),
    nec: par(120, tyresSec),
  },
});

/** Older cars: only default + IMSA exist (NEC/DTM fall back to default). */
const legacy = (
  id: string,
  label: string,
  match: string[],
  fillSec: number | null,
  tyresSec: number
): PitRuleClass => ({
  id,
  label,
  match,
  rules: { default: seq(fillSec, tyresSec), imsa: par(fillSec, tyresSec) },
});

/**
 * In table order. `match` is tried in this order too, so the more specific
 * names (911 Cup before GT3, HPD before LMP2) come first where they overlap —
 * see `guessPitRuleClass`.
 */
export const PIT_RULE_CLASSES: PitRuleClass[] = [
  {
    id: "gtp",
    label: "GTP / Hypercar",
    match: ["gtp", "hypercar", "lmdh", "963", "v-series.r", "m hybrid v8", "arx-06", "499p"],
    rules: { default: seq(40, 20), imsa: par(40, 20) },
  },
  {
    id: "lmp2",
    label: "Dallara P217 (LMP2)",
    match: ["p217", "lmp2"],
    rules: {
      default: seq(40, 20, "bodyworkAfterTyres"),
      imsa: par(40, 20, "bodyworkAfterTyres"),
    },
  },
  {
    id: "lmp3",
    label: "Ligier JS P320 (LMP3)",
    match: ["js p320", "jsp320", "p320", "lmp3"],
    rules: {
      default: seq(40, 20, "bodyworkAfterTyres"),
      imsa: par(40, 20, "bodyworkAfterTyres"),
    },
  },
  {
    // Before GT3: "Porsche 911 GT3 Cup" is a Cup car, not a GT3.
    id: "911cup",
    label: "Porsche 911 Cup (all variants)",
    match: ["911 gt3 cup", "911 cup", "gt3 cup", "992 cup"],
    rules: {
      default: seq(44, 20, "arbWingAfterFuelDuringTyres"),
      imsa: par(44, 20, "arbWingDuringService"),
      nec: par(120, 20, "arbWingDuringService"),
    },
  },
  {
    id: "gt3",
    label: "GT3 class (incl. legacy)",
    match: ["gt3"],
    rules: {
      default: seq(40, 20, "arbWingAfterFuelDuringTyres"),
      imsa: par(40, 20, "arbWingDuringService"),
      nec: par(120, 20, "arbWingDuringService"),
      dtm: par(40, 7, "arbWingDuringService"),
    },
  },
  club("rufcspec", "Ruf RT 12R C-Spec", ["c-spec", "c spec"], 44, 20),
  club("f296", "Ferrari 296 Challenge", ["296 challenge"], 53, 20),
  club("ctsv", "Cadillac CTS-V", ["cts-v", "cts v"], 48, 35),
  club("kia", "Kia Optima", ["optima"], 48, 36),
  club("gt4", "GT4 class (incl. legacy)", ["gt4"], 48, 35),
  club("tcr", "TCR class (incl. legacy)", ["tcr"], 52, 40),
  club("m2", "BMW M2 F87 & G87", ["m2"], 60, 40),
  club("gr86", "Toyota GR86", ["gr86"], 60, 40),
  club("mx5", "MX-5 (all variants)", ["mx-5", "mx5", "miata"], 60, 40),
  club("clio", "Renault Clio", ["clio"], 60, 40),
  club("fr500s", "Ford Mustang FR500S", ["fr500"], 60, 40),
  club("solstice", "Pontiac Solstice", ["solstice"], 60, 40),
  club("jetta", "VW Jetta TDI Cup", ["jetta"], 60, 40),
  club("ruf", "Ruf RT 12R (RWD & AWD)", ["ruf"], 60, 40),
  club("caterham", "Caterham Academy & 420R", ["caterham"], 60, 40),
  {
    id: "gte",
    label: "GTE class",
    match: ["gte"],
    rules: {
      default: seq(34, 20, "arbAfterFuelDuringTyres"),
      imsa: par(34, 20, "arbDuringService"),
    },
  },
  legacy("lmp1", "LMP1 class", ["lmp1", "919", "ts050", "r18"], 30, 20),
  legacy("hpd", "HPD ARX-01c (LMP2)", ["arx-01", "arx01"], 30, 20),
  legacy("gt1", "GT1 class", ["gt1"], 34, 20),
  legacy("fordgt2", "Ford GT (GT2)", ["ford gt gt2", "gt2"], 34, 20),
  legacy("dp", "Daytona Prototypes", ["daytona prototype", "riley", "corvette dp"], 30, 20),
  legacy("gtp-classic", "Nissan GTP & Audi 90 GTO", ["zx-t", "90 gto"], 45, 15),
  legacy("radical", "Radical SR8 & SR10", ["radical"], 40, 20),
  legacy("srf", "Spec Racer Ford", ["spec racer"], 36, 40),
  // Electric: the 820 s is a battery recharge, not a typo (Johann: the real
  // car charges to 75 % in 15 min). The "tank" is the battery.
  legacy("missionr", "Porsche Mission R", ["mission r"], 820, 20),
];

export function pitRuleClassById(id: string | null | undefined): PitRuleClass | null {
  if (!id) return null;
  return PIT_RULE_CLASSES.find((c) => c.id === id) ?? null;
}

/** Best guess of the rule class from the plan's car name; null = unknown. */
export function guessPitRuleClass(car: string | null | undefined): PitRuleClass | null {
  const name = (car ?? "").toLowerCase();
  if (!name.trim()) return null;
  // The old Nissan GTP would otherwise be read as a modern GTP.
  const order = [
    ...PIT_RULE_CLASSES.filter((c) => c.id === "gtp-classic"),
    ...PIT_RULE_CLASSES.filter((c) => c.id !== "gtp-classic"),
  ];
  for (const c of order) {
    if (c.match.some((m) => name.includes(m))) return c;
  }
  return null;
}

export type ResolvedPitRule = PitRuleEntry & {
  cls: PitRuleClass;
  /** The rule set asked for. */
  ruleset: PitRuleset;
  /** True when that rule set does not cover this class and iRacing uses the default rules. */
  fellBack: boolean;
};

export function resolvePitRule(cls: PitRuleClass, ruleset: PitRuleset): ResolvedPitRule {
  const own = cls.rules[ruleset];
  return { ...(own ?? cls.rules.default), cls, ruleset, fellBack: !own };
}

export function isPitRuleset(v: unknown): v is PitRuleset {
  return typeof v === "string" && (PIT_RULESETS as readonly string[]).includes(v);
}

/** iRacing's driver change takes 30 s and runs in parallel with service. */
export const IRACING_DRIVER_SWAP_SEC = 30;
