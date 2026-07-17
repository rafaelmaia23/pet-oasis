import { beforeEach, describe, expect, it } from "vitest";
import { buildEmployee } from "@/__tests__/factories/user.factory";
import { clearDatabase } from "@/__tests__/helpers/database";
import { prisma } from "@/lib/prisma";

// Regression guard: clearDatabase() must wipe transactional rows but preserve
// the reference seed (features/roles and their links). If a future change adds
// a reference table to clearDatabase, the factories would stop finding the
// roles/features they connect by name and the whole suite would break — this
// test fails loudly and locally instead.
describe("clearDatabase() reference-data preservation", () => {
  beforeEach(async () => {
    // Create transactional rows (a user with a role + profile) so we can prove
    // they are removed while the reference data stays.
    await buildEmployee({ roleNames: ["manager"] });
  });

  it("removes transactional rows but keeps features, roles and role_features", async () => {
    const before = {
      features: await prisma.feature.count(),
      roles: await prisma.role.count(),
      roleFeatures: await prisma.roleFeature.count(),
    };
    expect(before.features).toBeGreaterThan(0);
    expect(before.roles).toBeGreaterThan(0);
    expect(before.roleFeatures).toBeGreaterThan(0);
    // sanity: the transactional rows exist before clearing
    expect(await prisma.user.count()).toBeGreaterThan(0);

    await clearDatabase();

    // reference data is untouched
    expect(await prisma.feature.count()).toBe(before.features);
    expect(await prisma.role.count()).toBe(before.roles);
    expect(await prisma.roleFeature.count()).toBe(before.roleFeatures);

    // transactional data is gone
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.userRole.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(0);
  });
});
