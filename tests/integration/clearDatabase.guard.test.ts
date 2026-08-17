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
  });
});
