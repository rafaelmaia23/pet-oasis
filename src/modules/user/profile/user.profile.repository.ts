import { prisma } from "@/lib/prisma";
import { userInclude } from "@/modules/user/user.repository";

type createCustomerProfileData = {
  phone: string;
  address?: string | undefined;
  birthDate?: Date | undefined;
};

export async function createCustomerProfile(
  userId: string,
  data: createCustomerProfileData,
  roleNames: string[],
) {
  return prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: {
      customer: {
        create: {
          phone: data.phone,
          ...(data.address && { address: data.address }),
          ...(data.birthDate && { birthDate: data.birthDate }),
        },
      },
      roles: {
        create: roleNames.map((name) => ({
          role: { connect: { name } },
        })),
      },
    },
    include: userInclude,
  });
}

export async function createEmployeeProfile(
  userId: string,
  roleNames: string[],
) {
  return prisma.user.update({
    where: { id: userId, deletedAt: null },
    data: {
      employee: {
        create: {},
      },
      roles: {
        create: roleNames.map((name) => ({
          role: { connect: { name } },
        })),
      },
    },
    include: userInclude,
  });
}

export async function deleteCustomerProfile(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const customerRoles = await tx.role.findMany({
      where: { appliesTo: "CUSTOMER" },
      select: { id: true },
    });

    await tx.userRole.updateMany({
      where: {
        userId,
        deletedAt: null,
        roleId: { in: customerRoles.map((r) => r.id) },
      },
      data: { deletedAt: new Date() },
    });
  });
}

export async function deleteEmployeeProfile(userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    const employeeRoles = await tx.role.findMany({
      where: { appliesTo: "EMPLOYEE" },
      select: { id: true },
    });

    await tx.userRole.updateMany({
      where: {
        userId,
        deletedAt: null,
        roleId: { in: employeeRoles.map((r) => r.id) },
      },
      data: { deletedAt: new Date() },
    });
  });
}
