import { prisma } from "@/lib/prisma";
import type { RoleName } from "@/modules/role/role.constants";

const roleInclude = {
  features: { include: { feature: true } },
} as const;

export const getRolesByNames = async (names: RoleName[]) => {
  return prisma.role.findMany({
    where: {
      name: {
        in: names,
      },
    },
    include: roleInclude,
  });
};

export const getAllRoles = async () => {
  return prisma.role.findMany({
    include: roleInclude,
  });
};

export const getRoleById = async (id: string) => {
  return prisma.role.findUnique({
    where: { id },
    include: roleInclude,
  });
};

export const getRoleByName = async (name: RoleName) => {
  return prisma.role.findUnique({
    where: { name },
    include: roleInclude,
  });
};
