import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { FAKE_USER_ROSTER } from "@/lib/seed/fakeUsers.constants";
import { seedFakeUsers } from "@/lib/seed/seedFakeUsers";

afterEach(async () => {
  await clearDatabase();
});

async function findByEmail(email: string) {
  return prisma.user.findUniqueOrThrow({
    where: { email },
    include: {
      customer: true,
      employee: true,
      roles: { include: { role: true } },
    },
  });
}

describe("seedFakeUsers", () => {
  it("creates every entry in the roster on the first run", async () => {
    const result = await seedFakeUsers();

    expect(result.createdCount).toBe(FAKE_USER_ROSTER.length);
    expect(result.skippedCount).toBe(0);
    const count = await prisma.user.count();
    expect(count).toBe(FAKE_USER_ROSTER.length);
  });

  it("is idempotent — a second run creates nothing new", async () => {
    await seedFakeUsers();
    const result = await seedFakeUsers();

    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(FAKE_USER_ROSTER.length);
    const count = await prisma.user.count();
    expect(count).toBe(FAKE_USER_ROSTER.length);
  });

  it("gives every fake user the shared, known password", async () => {
    await seedFakeUsers();

    const plainCustomer = FAKE_USER_ROSTER.find(
      (d) => d.kind === "CUSTOMER" && d.trait === "NONE",
    );
    if (!plainCustomer)
      throw new Error("fixture roster missing a plain customer");

    const user = await findByEmail(plainCustomer.email);
    await expect(
      verifyPassword(env.SEED_FAKE_USER_PASSWORD, user.passwordHash),
    ).resolves.toBe(true);
  });

  it("creates hybrid users with both an active customer and employee profile", async () => {
    await seedFakeUsers();

    const hybridDef = FAKE_USER_ROSTER.find(
      (d) => d.kind === "HYBRID" && d.trait === "NONE",
    );
    if (!hybridDef) throw new Error("fixture roster missing a plain hybrid");

    const user = await findByEmail(hybridDef.email);
    expect(user.customer).not.toBeNull();
    expect(user.customer?.deletedAt).toBeNull();
    expect(user.employee).not.toBeNull();
    expect(user.employee?.deletedAt).toBeNull();
    expect(user.roles.map((r) => r.role.name)).toEqual(
      expect.arrayContaining(["customer"]),
    );
  });

  it("leaves the PENDING scenario user unverified", async () => {
    await seedFakeUsers();

    const def = FAKE_USER_ROSTER.find((d) => d.trait === "PENDING");
    if (!def) throw new Error("fixture roster missing a PENDING scenario user");

    const user = await findByEmail(def.email);
    expect(user.status).toBe("PENDING");
  });

  it("bans the BANNED scenario user", async () => {
    await seedFakeUsers();

    const def = FAKE_USER_ROSTER.find((d) => d.trait === "BANNED");
    if (!def) throw new Error("fixture roster missing a BANNED scenario user");

    const user = await findByEmail(def.email);
    expect(user.bannedAt).not.toBeNull();
  });

  it("soft-deletes the whole user for the DELETED_USER scenario", async () => {
    await seedFakeUsers();

    const def = FAKE_USER_ROSTER.find((d) => d.trait === "DELETED_USER");
    if (!def)
      throw new Error("fixture roster missing a DELETED_USER scenario user");

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: def.email },
    });
    expect(user.deletedAt).not.toBeNull();
  });

  it("soft-deletes only the employee profile for the DELETED_EMPLOYEE_PROFILE scenario", async () => {
    await seedFakeUsers();

    const def = FAKE_USER_ROSTER.find(
      (d) => d.trait === "DELETED_EMPLOYEE_PROFILE",
    );
    if (!def) {
      throw new Error(
        "fixture roster missing a DELETED_EMPLOYEE_PROFILE scenario user",
      );
    }

    const user = await findByEmail(def.email);
    expect(user.deletedAt).toBeNull();
    expect(user.customer).not.toBeNull();
    expect(user.customer?.deletedAt).toBeNull();
    expect(user.employee).not.toBeNull();
    expect(user.employee?.deletedAt).not.toBeNull();
  });

  it("assigns both attendant and manager roles across the plain employees", async () => {
    await seedFakeUsers();

    const employeeDefs = FAKE_USER_ROSTER.filter(
      (d) => d.kind === "EMPLOYEE" && d.trait === "NONE",
    );
    const roleNames = new Set<string>();
    for (const def of employeeDefs) {
      const user = await findByEmail(def.email);
      for (const r of user.roles) roleNames.add(r.role.name);
    }

    expect(roleNames.has("attendant")).toBe(true);
    expect(roleNames.has("manager")).toBe(true);
  });
});
