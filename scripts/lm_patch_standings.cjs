const fs = require("fs");
const FILE = process.env.FILE;
if (!FILE) {
  console.error("FILE env var not set");
  process.exit(1);
}
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Already wired? skip.
if (s.includes('href={`/leagues/${slug}/seasons/${seasonId}/penalty-pool`}') &&
    s.includes('cas-gt3-wct')) {
  console.log("  Button already present. Nothing to do.");
  process.exit(0);
}

// (a) Add Link import if missing
const linkImportRe = /from\s+["']next\/link["']/;
if (!linkImportRe.test(s)) {
  s = `import Link from "next/link";\n` + s;
}

// (b) Insert the button block right after the first <h1>...</h1>
const BUTTON_BLOCK =
`
      {season.league.slug === "cas-gt3-wct" && (
        <div className="mb-4">
          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}/penalty-pool\`}
            className="inline-block rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
          >
            View penalty pool →
          </Link>
        </div>
      )}
`;

const h1Re = /(<h1[^>]*>[\s\S]*?<\/h1>)/;
if (!h1Re.test(s)) {
  console.error("  Could not find an <h1> anchor. Printing first 80 lines:");
  console.error(s.split("\n").slice(0, 80).join("\n"));
  process.exit(1);
}
s = s.replace(h1Re, "$1" + BUTTON_BLOCK);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
