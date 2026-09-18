import { buildPet } from "@tests/factories/pet.factory";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

// Regression guard: clearDatabase() must wipe transactional rows but preserve
// the reference seed (features/roles and their links, plus the breed catalog
// from 9.3). If a future change adds a reference table to clearDatabase, the
// factories would stop finding the roles/features they connect by name and the
// whole suite would break — this test fails loudly and locally instead.
describe("clearDatabase() reference-data preservation", () => {
  beforeEach(async () => {
    // Create transactional rows (a user with a role + profile) so we can prove
    // they are removed while the reference data stays.
    const user = await buildEmployee({ roleNames: ["manager"] });
    await prisma.previousEmail.create({
      data: {
        userId: user.id,
        email: `old-${user.id}@example.com`,
        replacedAt: new Date(),
      },
    });

    // Pet é transacional e tem FK RESTRICT para `Customer` (9.4): se ele não
    // entrar no clearDatabase — e antes do cliente —, o teardown quebra por
    // violação de chave estrangeira, não por asserção. Este setup garante que
    // a falha apareça aqui, e não espalhada pela suíte inteira.
    const customer = await buildCustomer();
    await buildPet(customer.customer?.id ?? "");

    // Taxonomia do catálogo (9.6): transacional, diferente de `Breed`. A
    // categoria nasce com um filho de propósito — a FK é para a própria tabela,
    // e é o caso que provaria um teardown que apaga na ordem errada.
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });
    const root = await prisma.category.create({
      data: { name: "Alimentação", slug: "alimentacao" },
    });
    const child = await prisma.category.create({
      data: { name: "Ração", slug: "racao", parentId: root.id },
    });

    // Produto (9.7) amarra as três pontas da taxonomia: FK para `brands`, e as
    // duas junções apontando para `categories` e `tags`. Todas RESTRICT — o
    // produto tem que sair antes delas, e as junções antes do produto.
    await prisma.product.create({
      data: {
        name: "Ração Golden Adulto",
        slug: "racao-golden-adulto",
        description: "Ração seca para cães adultos.",
        brandId: brand.id,
        targetSpecies: ["DOG"],
        variants: {
          create: {
            sku: "GOLDEN-AD-15KG",
            label: "15 kg",
            priceCents: 24990,
            isDefault: true,
          },
        },
        categories: { create: { categoryId: child.id } },
        tags: { create: { tagId: tag.id } },
      },
    });
  });

  it("removes transactional rows but keeps features, roles, role_features and breeds", async () => {
    const before = {
      features: await prisma.feature.count(),
      roles: await prisma.role.count(),
      roleFeatures: await prisma.roleFeature.count(),
      breeds: await prisma.breed.count(),
    };
    expect(before.features).toBeGreaterThan(0);
    expect(before.roles).toBeGreaterThan(0);
    expect(before.roleFeatures).toBeGreaterThan(0);
    expect(before.breeds).toBeGreaterThan(0);
    // sanity: the transactional rows exist before clearing
    expect(await prisma.user.count()).toBeGreaterThan(0);
    expect(await prisma.pet.count()).toBeGreaterThan(0);
    expect(await prisma.category.count()).toBeGreaterThan(0);
    expect(await prisma.product.count()).toBeGreaterThan(0);

    await clearDatabase();

    // reference data is untouched
    expect(await prisma.feature.count()).toBe(before.features);
    expect(await prisma.role.count()).toBe(before.roles);
    expect(await prisma.roleFeature.count()).toBe(before.roleFeatures);
    expect(await prisma.breed.count()).toBe(before.breeds);

    // transactional data is gone
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.userRole.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.pet.count()).toBe(0);
    expect(await prisma.previousEmail.count()).toBe(0);
    expect(await prisma.brand.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.tag.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.productVariant.count()).toBe(0);
    expect(await prisma.productCategory.count()).toBe(0);
    expect(await prisma.productTag.count()).toBe(0);
  });
});
