import { prisma } from "@/lib/prisma";

export async function findAllFeatures() {
  return prisma.feature.findMany();
}

export async function findFeatureById(id: string) {
  return prisma.feature.findUnique({
    where: { id },
  });
}

export async function findFeatureByName(name: string) {
  return prisma.feature.findUnique({
    where: { name },
  });
}
