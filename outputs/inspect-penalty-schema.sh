#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Penalty model ==="
awk '/^model Penalty\b/,/^}/' prisma/schema.prisma || echo "  (no Penalty model)"

echo ""
echo "=== 2. Decision model ==="
awk '/^model Decision\b/,/^}/' prisma/schema.prisma || echo "  (no Decision model)"

echo ""
echo "=== 3. Round model (looking for completion/status fields) ==="
awk '/^model Round\b/,/^}/' prisma/schema.prisma

echo ""
echo "=== 4. Any result-style models (RaceResult / SessionResult / Result) ==="
awk '/^model (RaceResult|SessionResult|Result|RoundResult|Classification)\b/,/^}/' prisma/schema.prisma

echo ""
echo "=== 5. Existing penalty-points fields anywhere in schema ==="
grep -nE 'penalty[A-Z_]*Points|licensePoints|poolPoints|points\s+Int' prisma/schema.prisma | head -20

echo ""
echo "=== 6. Existing PenaltyPool / Pool / Suspension models? ==="
awk '/^model (PenaltyPool|PoolEntry|PenaltyPoolEntry|Suspension|LicensePoint)/,/^}/' prisma/schema.prisma || echo "  (none)"

echo ""
echo "=== 7. Registration model fields (looking for counter fields) ==="
awk '/^model Registration\b/,/^}/' prisma/schema.prisma

echo ""
echo "=== 8. Season model (look for completion of round) ==="
awk '/^model Season\b/,/^}/' prisma/schema.prisma | head -30

echo ""
echo "=== 9. Existing GT3 WCT league slug ==="
grep -nE 'gt3-wct|GT3.WCT|wct' src/ -r 2>/dev/null | head -10

echo ""
echo "=== 10. Where steward decisions are finalized (action file) ==="
grep -rn -E 'verdict.*=|decision\.create|decision\.update|decisionFinalized|finalizeDecision' src/app/admin 2>/dev/null | head -10

echo ""
echo "=== 11. Where round is marked complete (status enum literals) ==="
grep -rn -E 'RoundStatus|status.*COMPLETED|markComplete' src/ prisma/schema.prisma 2>/dev/null | head -10
