import fs from "node:fs";

const PAGE =
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Group type: rename proAmClass -> shortCode (string|null).
s = s.replace(
  /proAmClass: string \| null;/,
  "shortCode: string | null;"
);

// 2) Group construction: use cc?.shortCode instead of cc?.proAmClass.
s = s.replace(
  /proAmClass: \(cc\?\.proAmClass as string \| undefined\) \?\? null,/,
  "shortCode: cc?.shortCode ?? null,"
);

// 3) Group sort: use g.shortCode instead of g.proAmClass.
s = s.replace(
  /g\.proAmClass === "PRO" \? 0 : g\.proAmClass === "AM" \? 1 : 2 \+ g\.displayOrder/g,
  'g.shortCode === "PRO" ? 0 : g.shortCode === "AM" ? 1 : 2 + g.displayOrder'
);

fs.writeFileSync(PAGE, s);
console.log("Switched proAmClass references to shortCode.");
