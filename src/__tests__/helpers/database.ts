import { prisma } from "@/lib/prisma";

export async function clearDatabase() {
  await prisma.userFeature.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
