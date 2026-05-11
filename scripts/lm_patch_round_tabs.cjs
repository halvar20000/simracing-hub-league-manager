const fs = require("fs");
const FILE = process.env.FILE;
if (!FILE) { console.error("FILE env var not set"); process.exit(1); }

let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Already wired?
if (s.includes('Standings →') && s.includes('/standings`}')) {
  console.log("  Standings pill already present. Nothing to do.");
  process.exit(0);
}

// Anchor on the Teams conditional closer:
//             Teams
//           </Link>
//         )}
//       </div>
// Insert the Standings pill just BEFORE </div> so it stays inside the nav row.

const ANCHOR =
`            Teams
          </Link>
        )}
      </div>`;

if (!s.includes(ANCHOR)) {
  console.error("  Anchor not found. Top of nav block:");
  // print 30 lines starting at the View: span so we can see what's there
  const idx = s.indexOf('>View:<');
  if (idx >= 0) {
    console.error(s.slice(idx, idx + 1500));
  }
  process.exit(1);
}

const REPLACEMENT =
`            Teams
          </Link>
        )}
        <span className="mx-2 text-zinc-700" aria-hidden="true">|</span>
        <Link
          href={\`/leagues/\${slug}/seasons/\${seasonId}/standings\`}
          className={\`\${pillBase} \${pillOff}\`}
        >
          Standings →
        </Link>
      </div>`;

s = s.replace(ANCHOR, REPLACEMENT);

if (s === before) {
  console.error("  No edits made.");
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log("  Patched.");
