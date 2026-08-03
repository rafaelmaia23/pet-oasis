import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { seedAdminUser } from "@/lib/seed/seedAdminUser";

afterEach(async () => {
  await clearDatabase();
});

describe("seedAdminUser", () => {
  it("creates a full-access admin user with an employee profile", async () => {
    await seedAdminUser();

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: env.SEED_ADMIN_EMAIL },
      include: { employee: true, roles: { include: { role: true } } },
    });

    expect(user.status).toBe("ACTIVE");
    expect(user.employee).not.toBeNull();
    expect(user.roles.map((r) => r.role.name)).toEqual(["admin"]);
    await expect(
      verifyPassword(env.SEED_ADMIN_PASSWORD, user.passwordHash),
    ).resolves.toBe(true);
  });

  it("is idempotent — running twice does not create a second user", async () => {
    await seedAdminUser();
    await seedAdminUser();

    const count = await prisma.user.count({
      where: { email: env.SEED_ADMIN_EMAIL },
    });
    expect(count).toBe(1);
  });

  it("restores the admin user if it was banned since the last run", async () => {
    await seedAdminUser();
    const before = await prisma.user.findUniqueOrThrow({
      where: { email: env.SEED_ADMIN_EMAIL },
    });
    await prisma.user.update({
      where: { id: before.id },
      data: { bannedAt: new Date(), bannedBy: "someone", banReason: "test" },
    });

    await seedAdminUser();

    const after = await prisma.user.findUniqueOrThrow({
      where: { email: env.SEED_ADMIN_EMAIL },
    });
    expect(after.bannedAt).toBeNull();
    expect(after.bannedBy).toBeNull();
    expect(after.banReason).toBeNull();
  });
});
