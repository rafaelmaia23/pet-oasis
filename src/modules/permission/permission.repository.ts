import { prisma } from "@/lib/prisma";

export async function findUserFeatures(userId: string) {
  return prisma.userFeature.findMany({
    where: { userId },
    include: {
      feature: true,
    },
  });
}

export async function assignFeatureToUser(userId: string, featureId: string) {
  return prisma.userFeature.create({
    data: {
      userId,
      featureId,
    },
  });
}

export async function removeFeatureFromUser(userId: string, featureId: string) {
  return prisma.userFeature.delete({
    where: {
      userId_featureId: {
        userId,
        featureId,
      },
    },
  });
}

export async function assignManyFeaturesToUser(
  userId: string,
  featureIds: string[],
) {
  return prisma.userFeature.createMany({
    data: featureIds.map((featureId) => ({ userId, featureId })),
    skipDuplicates: true,
  });
}
