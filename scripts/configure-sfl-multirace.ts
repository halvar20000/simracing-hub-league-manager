import { prisma } from "@/lib/prisma";

const RACE1: Record<string, number> = {
  "1": 25, "2": 22, "3": 19, "4": 17, "5": 16, "6": 15, "7": 14,
  "8": 13, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};
const RACE2: Record<string, number> = {
  "1": 30, "2": 27, "3": 24, "4": 22, "5": 20, "6": 18, "7": 16,
  "8": 14, "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7,
  "15": 6, "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
  "21": 0, "22": 0, "23": 0, "24": 0, "25": 0, "26": 0, "27": 0, "28": 0,
};

async function main() {
  const ss = await prisma.scoringSystem.findUnique({ where: { name: "CAS SFL Cup" } });
  if (!ss) throw new Error("CAS SFL Cup scoring system not found");
  await prisma.scoringSystem.update({
    where: { id: ss.id },
    data: {
      racesPerRound: 2,
      pointsTable: RACE1,
      pointsTableRace2: RACE2,
    },
  });
  console.log("CAS SFL Cup configured: racesPerRound=2, pointsTable (R1) + pointsTableRace2 (R2) updated.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
