import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const logoMap: Record<string, string> = {
  "cas-gt3-wct":      "/logos/cas-gt3-wct.webp",
  "cas-iec":          "/logos/cas-iec.webp",
  "cas-combined-cup": "/logos/cas-combined-cup.webp",
  "cas-sfl-cup":      "/logos/cas-sfl-cup.webp",
  "cas-pccd":         "/logos/cas-pccd.webp",
  "cas-tss-gt4":      "/logos/cas-tss-gt4.webp",
};

async function main() {
  for (const [slug, url] of Object.entries(logoMap)) {
    const result = await prisma.league.updateMany({
      where: { slug },
      data: { logoUrl: url },
    });
    console.log(
      `  ${slug.padEnd(20)} → ${url}  ${result.count > 0 ? "✓" : "(no row matched)"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
