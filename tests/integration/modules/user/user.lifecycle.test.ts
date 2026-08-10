import { attachOverrides, buildHybrid } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import { afterEach, assert, describe, expect, it } from "vitest";
import type { ProfileKind } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  deleteCustomerProfile,
  deleteEmployeeProfile,
} from "@/modules/user/profile/user.profile.repository";
import {
  restoreProfile,
  restoreProfilesOfUser,
} from "@/modules/user/user.lifecycle.repository";
import { softDeleteUserAndInvalidateSessions } from "@/modules/user/user.repository";

// A restauração ainda não tem rota (8.3/8.5 a ligam); estes testes dirigem o
// repositório direto, mesmo idioma de `tests/integration/scripts/`.

afterEach(async () => {
  await clearDatabase();
});

const activeOverrideNames = async (userId: string) =>
  (
    await prisma.userFeature.findMany({
      where: { deletedAt: null, userRole: { userId } },
      include: { feature: true },
    })
  ).map((override) => override.feature.name);

const roleIdByName = async (name: string) =>
  (await prisma.role.findUniqueOrThrow({ where: { name } })).id;

const activeRoleNames = async (userId: string) =>
  (
    await prisma.userRole.findMany({
      where: { userId, deletedAt: null },
      include: { role: true },
    })
  ).map((userRole) => userRole.role.name);

const deletedAtOfRole = async (userId: string, roleName: string) =>
  (
    await prisma.userRole.findFirstOrThrow({
      where: { userId, role: { name: roleName } },
    })
  ).deletedAt;

const restore = (
  userId: string,
  kind: ProfileKind,
  options: Parameters<typeof restoreProfile>[3],
) => prisma.$transaction((tx) => restoreProfile(tx, userId, kind, options));

describe("restoreProfile()", () => {
  it("should bring back only the roles that died with the profile, honouring the admin's choice on the next cycle (§3.1)", async () => {
    const target = await buildHybrid({
      employeeRoles: ["attendant", "manager"],
    });

    const attendantRoleId = await roleIdByName("attendant");

    // T2 — o perfil morre levando attendant e manager juntas.
    await deleteEmployeeProfile(target.id);

    const t2 = await deletedAtOfRole(target.id, "manager");
    assert(t2 !== null, "manager deveria ter morrido na cascata");

    // O admin religa o perfil escolhendo **só** attendant; manager fica em T2.
    await restore(target.id, "EMPLOYEE", {
      roleIds: [attendantRoleId],
    });

    expect(await activeRoleNames(target.id)).toEqual(
      expect.arrayContaining(["attendant"]),
    );
    expect(await activeRoleNames(target.id)).not.toContain("manager");
    expect((await deletedAtOfRole(target.id, "manager"))?.getTime()).toBe(
      t2.getTime(),
    );

    // T3 — o perfil morre de novo; agora só attendant estava viva.
    await deleteEmployeeProfile(target.id);

    const t3 = await deletedAtOfRole(target.id, "attendant");
    assert(t3 !== null && t3.getTime() !== t2.getTime(), "T3 deveria ser novo");

    // Religa sem escolher nada: volta só attendant. A recusa do admin em T2
    // persiste sozinha, sem nenhuma regra extra — manager não bate com T3.
    await restore(target.id, "EMPLOYEE", {});

    expect(await activeRoleNames(target.id)).toContain("attendant");
    expect(await activeRoleNames(target.id)).not.toContain("manager");
  });

  it("should never bring an override back, whatever killed it (D6')", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    await attachOverrides(target.id, {
      grants: ["read:log", "read:audit-log"],
      overrideRole: "attendant",
    });

    // Um morre sozinho, muito antes; o outro morre na cascata do perfil. Antes
    // do K16 essa diferença de `deletedAt` decidia quem voltava — agora a
    // restauração para na role e os dois ficam mortos igualmente.
    const removedOnPurpose = await prisma.userFeature.findFirstOrThrow({
      where: { feature: { name: "read:log" }, userRole: { userId: target.id } },
    });

    await prisma.userFeature.update({
      where: { id: removedOnPurpose.id },
      data: { deletedAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    await deleteEmployeeProfile(target.id);
    await restore(target.id, "EMPLOYEE", {});

    // A role volta — é até onde a restauração sobe.
    expect(await activeRoleNames(target.id)).toContain("attendant");
    expect(await activeOverrideNames(target.id)).toEqual([]);

    // As linhas continuam lá, soft-deletadas: evidência para o audit.
    const rows = await prisma.userFeature.findMany({
      where: { userRole: { userId: target.id } },
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
  });

  it("should be a no-op when there is no dead profile to restore", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    const result = await restore(target.id, "EMPLOYEE", {});

    expect(result).toBeNull();
    expect(await activeRoleNames(target.id)).toEqual(
      expect.arrayContaining(["attendant", "customer"]),
    );
  });

  it("should be idempotent: restoring twice drags nothing extra back", async () => {
    const target = await buildHybrid({
      employeeRoles: ["attendant", "manager"],
    });

    const attendantRoleId = await roleIdByName("attendant");

    await deleteEmployeeProfile(target.id);
    await restore(target.id, "EMPLOYEE", {
      roleIds: [attendantRoleId],
    });

    const second = await restore(target.id, "EMPLOYEE", {});

    expect(second).toBeNull();
    expect(await activeRoleNames(target.id)).not.toContain("manager");
  });
});

describe("restoreProfilesOfUser()", () => {
  it("should restore only what died with the account", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    await attachOverrides(target.id, {
      grants: ["read:log"],
      overrideRole: "attendant",
    });

    // O perfil de cliente já estava morto muito antes da conta.
    await deleteCustomerProfile(target.id);

    await softDeleteUserAndInvalidateSessions(target.id);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert(user.deletedAt !== null, "a conta deveria estar deletada");

    const result = await prisma.$transaction((tx) =>
      restoreProfilesOfUser(tx, target.id, user.deletedAt as Date, {
        kinds: ["CUSTOMER", "EMPLOYEE"],
      }),
    );

    expect(result.profiles).toEqual(["EMPLOYEE"]);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { userId: target.id },
    });

    // O perfil de cliente morreu num instante que não bate com o da conta: quem
    // o quiser de volta terá de pedir explicitamente (8.5), não vem de carona.
    expect(customer.deletedAt).not.toBeNull();
    expect(employee.deletedAt).toBeNull();

    expect(await activeRoleNames(target.id)).toEqual(["attendant"]);

    // A role volta; o override pendurado nela, não (D6').
    expect(await activeOverrideNames(target.id)).toEqual([]);
  });

  it("should restore only the profiles the caller asked for", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    await softDeleteUserAndInvalidateSessions(target.id);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    assert(user.deletedAt !== null, "a conta deveria estar deletada");

    const result = await prisma.$transaction((tx) =>
      restoreProfilesOfUser(tx, target.id, user.deletedAt as Date, {
        kinds: ["CUSTOMER"],
      }),
    );

    expect(result.profiles).toEqual(["CUSTOMER"]);

    const employee = await prisma.employee.findUniqueOrThrow({
      where: { userId: target.id },
    });

    expect(employee.deletedAt).not.toBeNull();
    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
  });
});
