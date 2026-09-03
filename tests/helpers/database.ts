import { prisma } from "@/lib/prisma";
import { refreshSearchLexemes } from "@/modules/product/product.search.repository";

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
  // Catálogo (9.6/9.7) — dado transacional criado pelos testes, não referência
  // semeada como Breed. A ordem é de baixo para cima: junções, variantes,
  // produto e só então a taxonomia, porque toda FK aqui é RESTRICT.
  // `categories` tem FK para si mesma, mas o DELETE varre a tabela inteira,
  // então nenhum pai sobra referenciado.
  await prisma.productTag.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.productVariant.deleteMany();
  // 9.10: a FK é RESTRICT como as demais, então a imagem sai antes do produto.
  // Só a LINHA — o arquivo no disco fica, e não faz mal: `UPLOAD_DIR` é um
  // diretório único deste run em `os.tmpdir()` (vitest.config.ts), apagado
  // inteiro no teardown. Dar responsabilidade de filesystem ao clearDatabase
  // seria repetir a armadilha do dicionário da busca por outra porta.
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.category.deleteMany();
  await prisma.tag.deleteMany();
  // O dicionário da busca (9.9) é derivado do catálogo, mas é uma view
  // materializada: apagar os produtos não apaga as palavras deles. Sem este
  // refresh as palavras de um arquivo de teste sobrevivem para o seguinte e
  // podem corrigir a busca dele para algo que não existe mais.
  await refreshSearchLexemes();
}
