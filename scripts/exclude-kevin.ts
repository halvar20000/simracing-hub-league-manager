import { prisma } from "@/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { lastName: "Hilgenhövel", firstName: { startsWith: "Kevin" } },
  });
  if (!user) { console.log("Kevin not found"); return; }

  const reg = await prisma.registration.findFirst({
    where: { userId: user.id },
    include: { season: { select: { league: { select: { slug: true } }, name: true } } },
  });
  if (!reg) { console.log("No registration for Kevin"); return; }
  console.log(
    "Found:",
    reg.season.league.slug,
    reg.season.name,
    "current status =",
    reg.status,
    "current excludedAt =",
    reg.excludedAt
  );

  const updated = await prisma.registration.update({
    where: { id: reg.id },
    data: {
      status: "APPROVED",
      excludedAt: reg.excludedAt ?? new Date(),
      approvedAt: reg.approvedAt ?? new Date(),
    },
  });
  console.log(
    "Updated:",
    "status =",
    updated.status,
    "excludedAt =",
    updated.excludedAt?.toISOString()
  );
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
