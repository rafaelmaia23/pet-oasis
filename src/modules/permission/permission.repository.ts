import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";

// A role de cada override é o que o presenter expõe (K2) — sempre que um
// override sai daqui, sai com a atribuição a que pertence.
const overrideInclude = {
  feature: true,
  userRole: { include: { role: true } },
} as const;

const userRoleInclude = {
  role: { include: { features: { include: { feature: true } } } },
} as const;

/**
 * Política de restauração de override (D6 + D16). Ambas as pontas são regra de
 * negócio, então moram no service e chegam aqui como função: o repositório sabe
 * *que* precisa filtrar e auditar, não *qual* é o critério.
 */
export type OverrideRestorePolicy = {
  /** `false` → o override fica morto para sempre (§9.1.1 do redesenho). */
  canRestore: (featureName: string) => boolean;
  /** Descritor do audit de descarte, um por override pulado (K3). */
  describeSkip: (featureName: string) => AuditDescriptor;
};

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
 * Nesta sub-fase a restauração pega **todos** os overrides mortos da atribuição;
 * a 8.2 estreita para "os que morreram no mesmo instante que ela".
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

    const userRole = await tx.userRole.update({
      where: { id: existing.id },
      data: { deletedAt: null },
      include: userRoleInclude,
    });

    const deadOverrides = await tx.userFeature.findMany({
      where: { userRoleId: userRole.id, deletedAt: { not: null } },
      include: { feature: true },
    });

    const restorable: string[] = [];
    const skipped: string[] = [];

    for (const override of deadOverrides) {
      policy.canRestore(override.feature.name)
        ? restorable.push(override.id)
        : skipped.push(override.feature.name);
    }

    if (restorable.length > 0) {
      await tx.userFeature.updateMany({
        where: { id: { in: restorable } },
        data: { deletedAt: null },
      });
    }

    // O descarte é silencioso na resposta: o audit é o único rastro dele.
    for (const featureName of skipped) {
      await record(policy.describeSkip(featureName), tx);
    }

    if (audit) await record(audit, tx);
    return userRole;
  });
}

/**
 * Revoga a role e cascateia para os overrides pendurados nela (D2), na mesma
 * transação e com **um único** timestamp — ensaio do D4, que a 8.1 generaliza
 * para a cascata inteira. O audit é montado pelo service, que precisa do número
 * de overrides derrubados na metadata (K6).
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

    const { count } = await tx.userFeature.updateMany({
      where: { userRoleId, deletedAt: null },
      data: { deletedAt },
    });

    if (describeAudit) {
      await record(describeAudit({ cascadedOverrides: count }), tx);
    }

    return userRole;
  });
}
