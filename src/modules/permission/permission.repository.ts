import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import {
  cascadeDeleteOverrides,
  type OverrideRestorePolicy,
  restoreOverridesOfUserRole,
} from "@/modules/user/user.lifecycle.repository";

// A role de cada override é o que o presenter expõe (K2) — sempre que um
// override sai daqui, sai com a atribuição a que pertence.
const overrideInclude = {
  feature: true,
  userRole: { include: { role: true } },
} as const;

const userRoleInclude = {
  role: { include: { features: { include: { feature: true } } } },
} as const;

// A política de restauração (D6/D16) nasceu aqui na 8.0 e mudou de casa na 8.2,
// quando religar perfil e reativar conta passaram a precisar dela também.
export type { OverrideRestorePolicy };

export async function getUserFeatures(userId: string) {
  return prisma.userFeature.findMany({
    where: { deletedAt: null, userRole: { userId, deletedAt: null } },
    include: overrideInclude,
  });
}

export async function findActiveUserRole(userId: string, roleId: string) {
  return prisma.userRole.findFirst({
    where: { userId, roleId, deletedAt: null },
  });
}

export async function findActiveUserFeature(
  userId: string,
  roleId: string,
  featureId: string,
) {
  return prisma.userFeature.findFirst({
    where: {
      featureId,
      deletedAt: null,
      userRole: { userId, roleId, deletedAt: null },
    },
  });
}

/**
 * Cria ou revive o override do par `(userRole, feature)`. O `@@unique` cobre
 * linhas mortas também, então "cria de novo" não existe: é sempre reuso de
 * linha, mesmo idioma de `addUserRole` (D3).
 */
export async function upsertUserFeature(
  userRoleId: string,
  featureId: string,
  granted: boolean,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.userFeature.findUnique({
      where: { userRoleId_featureId: { userRoleId, featureId } },
    });

    const userFeature = existing
      ? await tx.userFeature.update({
          where: { id: existing.id },
          data: { granted, deletedAt: null },
          include: overrideInclude,
        })
      : await tx.userFeature.create({
          data: { userRoleId, featureId, granted },
          include: overrideInclude,
        });

    if (audit) await record(audit, tx);
    return userFeature;
  });
}

export async function removeUserFeature(
  userFeatureId: string,
  audit?: AuditDescriptor,
) {
  const updateArgs = {
    where: { id: userFeatureId, deletedAt: null },
    data: { deletedAt: new Date() },
  };

  if (!audit) return prisma.userFeature.update(updateArgs);

  return prisma.$transaction(async (tx) => {
    const userFeature = await tx.userFeature.update(updateArgs);
    await record(audit, tx);
    return userFeature;
  });
}

export async function getUserRoles(userId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId, deletedAt: null },
    include: userRoleInclude,
  });

  return userRoles.map((ur) => ur.role);
}

/**
 * Concede a role **reusando** a linha do par `(userId, roleId)` (D3) e, quando
 * a linha já existia, restaura os overrides que morreram com ela (D6) — filtrados
 * pela política de não-escalação (D16).
 *
 * "Morreram com ela" é literal (D5): só volta o override cujo `deletedAt` é
 * igual ao da linha, lido **antes** de zerá-la. Override removido de propósito
 * tem timestamp próprio e nunca ressuscita.
 */
export async function addUserRole(
  userId: string,
  roleId: string,
  policy: OverrideRestorePolicy,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
    });

    if (!existing) {
      const created = await tx.userRole.create({
        data: { userId, roleId },
        include: userRoleInclude,
      });

      if (audit) await record(audit, tx);
      return created;
    }

    await restoreOverridesOfUserRole(tx, existing, policy);

    const userRole = await tx.userRole.update({
      where: { id: existing.id },
      data: { deletedAt: null },
      include: userRoleInclude,
    });

    if (audit) await record(audit, tx);
    return userRole;
  });
}

/**
 * Revoga a role e cascateia para os overrides pendurados nela (D2), na mesma
 * transação e com **um único** timestamp (D4). O elo de baixo é o mesmo que a
 * cascata de perfil e de conta usam (`cascadeDeleteOverrides`). O audit é
 * montado pelo service, que precisa do número de overrides derrubados na
 * metadata (K6).
 */
export async function removeUserRole(
  userRoleId: string,
  describeAudit?: (context: { cascadedOverrides: number }) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const deletedAt = new Date();

    const userRole = await tx.userRole.update({
      where: { id: userRoleId, deletedAt: null },
      data: { deletedAt },
    });

    const count = await cascadeDeleteOverrides(tx, [userRoleId], deletedAt);

    if (describeAudit) {
      await record(describeAudit({ cascadedOverrides: count }), tx);
    }

    return userRole;
  });
}
