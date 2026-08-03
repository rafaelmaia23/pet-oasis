import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";

export async function getUserFeatures(userId: string) {
  return prisma.userFeature.findMany({
    where: { userId, deletedAt: null },
    include: {
      feature: true,
    },
  });
}

export async function upsertUserFeature(
  userId: string,
  featureId: string,
  granted: boolean,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.userFeature.findFirst({
      where: { userId, featureId, deletedAt: null },
    });

    const userFeature = existing
      ? await tx.userFeature.update({
          where: { id: existing.id },
          data: { granted },
          include: { feature: true },
        })
      : await tx.userFeature.create({
          data: { userId, featureId, granted },
          include: { feature: true },
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
    include: {
      role: { include: { features: { include: { feature: true } } } },
    },
  });

  return userRoles.map((ur) => ur.role);
}

export async function addUserRole(
  userId: string,
  roleId: string,
  audit?: AuditDescriptor,
) {
  const createArgs = {
    data: { userId, roleId },
    include: {
      role: { include: { features: { include: { feature: true } } } },
    },
  };

  if (!audit) return prisma.userRole.create(createArgs);

  return prisma.$transaction(async (tx) => {
    const userRole = await tx.userRole.create(createArgs);
    await record(audit, tx);
    return userRole;
  });
}

export async function removeUserRole(
  userRoleId: string,
  audit?: AuditDescriptor,
) {
  const updateArgs = {
    where: { id: userRoleId, deletedAt: null },
    data: { deletedAt: new Date() },
  };

  if (!audit) return prisma.userRole.update(updateArgs);

  return prisma.$transaction(async (tx) => {
    const userRole = await tx.userRole.update(updateArgs);
    await record(audit, tx);
    return userRole;
  });
}
