import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { assertDemoModeEnabled, runDemoReset } from "@/scripts/demo-reset";

afterEach(async () => {
  await clearDatabase();
});

describe("assertDemoModeEnabled", () => {
  it("throws when DEMO_MODE is disabled", () => {
    expect(() => assertDemoModeEnabled(false)).toThrow();
  });

  it("does not throw when DEMO_MODE is enabled", () => {
    expect(() => assertDemoModeEnabled(true)).not.toThrow();
  });
});

describe("runDemoReset", () => {
  it("wipes transactional data left over by visitors, keeping Role/Feature intact", async () => {
    const customer = await buildCustomer();
    const employee = await buildEmployee();
    await prisma.session.create({
      data: {
        userId: customer.id,
        refreshTokenHash: hashToken(generateOpaqueToken()),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.verificationToken.create({
      data: {
        userId: customer.id,
        tokenHash: hashToken(generateOpaqueToken()),
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "USER_CREATED",
        targetType: "User",
        targetId: customer.id,
      },
    });
    await prisma.previousEmail.create({
      data: {
        userId: customer.id,
        email: `old-${customer.email}`,
        replacedAt: new Date(),
      },
    });

    const rolesBefore = await prisma.role.count();
    const featuresBefore = await prisma.feature.count();

    const result = await runDemoReset({ dryRun: false });

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.verificationToken.count()).toBe(0);
    expect(await prisma.previousEmail.count()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { targetId: customer.id } }),
    ).toBe(0);
    expect(await prisma.role.count()).toBe(rolesBefore);
    expect(await prisma.feature.count()).toBe(featuresBefore);
    expect(result.seed.rolesCount).toBe(rolesBefore);
    expect(result.seed.featuresCount).toBe(featuresBefore);
    expect(result.counts.customer).toBeGreaterThanOrEqual(1);
    expect(result.counts.employee).toBeGreaterThanOrEqual(1);
    expect(result.counts.previousEmail).toBeGreaterThanOrEqual(1);
    // SEED_FAKE_DATA/SEED_ADMIN_USER ficam desligados em teste (não sujam a
    // suíte) — guarda contra alguém ligar os dois sem querer no .env.test.
    expect(result.seed.adminUserSeeded).toBe(false);
    expect(result.seed.fakeUsersCreated).toBe(0);
    void employee;
  });

  it("does not touch anything in dry-run mode, and reports the counts that would be wiped", async () => {
    const customer = await buildCustomer();
    await prisma.previousEmail.create({
      data: {
        userId: customer.id,
        email: `old-${customer.email}`,
        replacedAt: new Date(),
      },
    });

    const result = await runDemoReset({ dryRun: true });

    expect(result.counts.customer).toBeGreaterThanOrEqual(1);
    expect(result.counts.previousEmail).toBeGreaterThanOrEqual(1);
    await expect(
      prisma.user.findUnique({ where: { id: customer.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.previousEmail.count({ where: { userId: customer.id } }),
    ).resolves.toBe(1);
  });

  it("records DEMO_RESET_EXECUTED in the audit log only on a real run", async () => {
    await buildCustomer();

    await runDemoReset({ dryRun: true });
    expect(
      await prisma.auditLog.count({ where: { action: "DEMO_RESET_EXECUTED" } }),
    ).toBe(0);

    await runDemoReset({ dryRun: false });
    const rows = await prisma.auditLog.findMany({
      where: { action: "DEMO_RESET_EXECUTED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetType).toBe("System");
    expect(rows[0]?.actorId).toBeNull();
  });
});
