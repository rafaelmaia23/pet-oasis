import { env } from "../src/config/env";
import { prisma } from "../src/lib/prisma";
import { runSeed } from "../src/lib/seedDatabase";

async function main() {
  console.log("SEEDING DATABASE STARTED...");

  const result = await runSeed();

  console.log(`${result.featuresCount} features sincronizadas com sucesso.`);
  console.log(`${result.rolesCount} roles sincronizadas com sucesso.`);
  // Só quando cria: numa re-execução (o entrypoint roda o seed a cada boot) o
  // catálogo já está lá e o silêncio é a confirmação da idempotência.
  if (result.breedsCreated > 0) {
    console.log(`${result.breedsCreated} raças semeadas com sucesso.`);
  }
  if (result.demoUserSeeded) {
    console.log(`Usuário demo (${env.DEMO_EMAIL}) sincronizado com sucesso.`);
  }
  if (result.adminUserSeeded) {
    console.log(
      `Usuário admin de teste (${env.SEED_ADMIN_EMAIL}) sincronizado com sucesso.`,
    );
  }
  if (result.fakeUsersCreated > 0) {
    console.log(
      `${result.fakeUsersCreated} usuários fake criados (dataset de demonstração).`,
    );
  }
  if (result.fakePetsCreated > 0) {
    console.log(`${result.fakePetsCreated} pets fake criados.`);
  }
  if (result.fakeProductsCreated > 0) {
    console.log(
      `${result.fakeProductsCreated} produtos fake criados (com marca, categoria, tag e imagem).`,
    );
  }

  // Um passo de demonstração que falhou já foi logado em nível de erro lá
  // dentro (10.3) — mas o entrypoint segue e o boot continua, então a última
  // linha do seed é a que o operador lê no `prod:logs`: ela não pode dizer
  // "COMPLETED" limpo quando faltou dado.
  if (result.failedOptionalSteps.length > 0) {
    console.error(
      `SEEDING COMPLETED WITH FAILURES: ${result.failedOptionalSteps.join(", ")} — dado de demonstração faltando; a API sobe assim mesmo.`,
    );
    return;
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
