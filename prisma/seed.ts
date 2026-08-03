import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { runSeed } from "../src/lib/seedDatabase";

async function main() {
  console.log("SEEDING DATABASE STARTED...");

  const result = await runSeed();

  console.log(`${result.featuresCount} features sincronizadas com sucesso.`);
  console.log(`${result.rolesCount} roles sincronizadas com sucesso.`);
  if (result.demoUserSeeded) {
    console.log(`Usuário demo (${env.DEMO_EMAIL}) sincronizado com sucesso.`);
  }

  console.log("SEEDING COMPLETED!");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
