import { prisma } from "@/lib/prisma";
import type { FeatureName } from "@/modules/feature/feature.constants";

export async function getAllFeatures() {
  return prisma.feature.findMany();
}

export async function getFeatureById(id: string) {
  return prisma.feature.findUnique({
    where: { id },
  });
}

export async function getFeatureByName(name: FeatureName) {
  return prisma.feature.findUnique({
    where: { name },
  });
}
