import { prisma } from "@/lib/prisma";

// Wipes only the transactional tables (users/sessions/tokens/profiles), in
// FK-safe order. It deliberately does NOT touch the reference tables
// (Feature, Role, RoleFeature, Breed): those are seeded once by the Vitest
// globalSetup and must survive between tests, because the factories
// (buildEmployee / buildCustomer) connect users to roles/features by name, and
// the pet tests (9.4) look breeds up by name too. Deleting them here would
// break every test that grants a role. Guarded by clearDatabase.guard.test.ts.
export async function clearDatabase() {
  // Sem FK: pode ir a qualquer momento. Append-only na app, mas o teardown de
  // teste faz hard delete para isolar cada teste.
  await prisma.auditLog.deleteMany();
  await prisma.userFeature.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.previousEmail.deleteMany();
  // Antes de `customer`: a FK `Pet.customerId` é RESTRICT, então apagar o
  // cliente com pet vivo estoura. `Breed` continua fora — é referência.
  await prisma.pet.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  // Taxonomia do catálogo (9.6) — dado transacional criado pelos testes, não
  // referência semeada como Breed. `categories` tem FK para si mesma, mas o
  // DELETE varre a tabela inteira, então nenhum pai sobra referenciado.
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
}
