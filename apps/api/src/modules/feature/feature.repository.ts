import type { FeatureName } from "@pet-oasis/api-contracts/feature";
import { prisma } from "@/lib/prisma";

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
