import { prisma } from "../src/lib/prisma";
import { DEFAULT_FEATURES } from "../src/modules/feature/feature.constants";

async function main() {
  console.log("Seeding features...");

  await prisma.feature.createMany({
    data: [...DEFAULT_FEATURES],
    skipDuplicates: true,
  });

  console.log(`${DEFAULT_FEATURES.length} features criadas com sucesso.`);
  console.log("Seed concluída.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
