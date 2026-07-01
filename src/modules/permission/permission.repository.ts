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
) {
  const existingUserFeature = await prisma.userFeature.findFirst({
    where: { userId, featureId, deletedAt: null },
  });

  if (existingUserFeature) {
    return prisma.userFeature.update({
      where: { id: existingUserFeature.id },
      data: { granted },
      include: { feature: true },
    });
  }

  return prisma.userFeature.create({
    data: { userId, featureId, granted },
    include: { feature: true },
  });
}

export async function removeUserFeature(userFeatureId: string) {
  return prisma.userFeature.update({
    where: {
      id: userFeatureId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
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

export async function addUserRole(userId: string, roleId: string) {
  return prisma.userRole.create({
    data: { userId, roleId },
    include: {
      role: { include: { features: { include: { feature: true } } } },
    },
  });
}
