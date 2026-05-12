#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// We need to close the block-body arrow function we introduced.
// Original (old arrow→paren return):  </Link>\n            ))}
// Target  (new block body return):    </Link>\n            ); })}
const before = `              </Link>
            ))}
          </div>
        </section>
      )}
      {/* Seasons grid */}`;

const after  = `              </Link>
            ); })}
          </div>
        </section>
      )}
      {/* Seasons grid */}`;

if (s.includes("); })}")) {
  console.log("Already patched.");
} else if (!s.includes(before)) {
  console.error("Closing anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Patched: closing now matches block-body arrow function.");
}
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Lines 386–395 (post-fix) ==="
sed -n '386,395p' 'src/app/leagues/[slug]/page.tsx'

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "League page: fix closing of recentPodiums.map block-body callback"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
