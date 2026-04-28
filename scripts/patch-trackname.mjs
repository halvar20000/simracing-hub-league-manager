import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// Replace `R{round.roundNumber} · {round.trackName ?? "Round"}`
// with just `R{round.roundNumber}` for now — we'll add a real track
// label back as soon as we know which field to read.
s = s.replace(
  /R\{round\.roundNumber\}\s*·\s*\{round\.trackName \?\? "Round"\}/,
  "R{round.roundNumber}"
);

fs.writeFileSync(PAGE, s);
console.log("Removed round.trackName access from h1.");
