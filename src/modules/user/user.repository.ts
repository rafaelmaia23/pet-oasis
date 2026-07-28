import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "../role/role.constants";

type createUserData = {
  name: string;
  cpf: string;
  email: string;
  passwordHash: string;
  roleNames: RoleName[];
};

export type createEmployeeData = createUserData;

export type createCustomerData = createUserData & {
  phone: string;
};

type updateUserData = {
  name?: string | undefined;
  email?: string | undefined;
  passwordHash?: string | undefined;
};

export const userInclude = {
  employee: true,
  customer: true,
  roles: {
    where: { deletedAt: null },
    include: {
      role: true,
    },
  },
  features: {
    where: { deletedAt: null },
    include: {
      feature: true,
    },
  },
} as const;

export async function findUserById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: userInclude,
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, deletedAt: null },
    include: userInclude,
  });
}

export async function findAllUsers() {
  return prisma.user.findMany({
    where: { deletedAt: null },
    include: userInclude,
  });
}

export async function createEmployee(
  data: createEmployeeData,
  audit?: AuditDescriptor,
) {
  const createArgs = {
    data: {
      name: data.name,
      cpf: data.cpf,
      email: data.email,
      passwordHash: data.passwordHash,
      roles: {
        create: data.roleNames.map((name) => ({
          role: { connect: { name } },
        })),
      },
      employee: {
        create: {},
      },
    },
    include: userInclude,
  };

  if (!audit) return prisma.user.create(createArgs);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create(createArgs);
    await record({ ...audit, targetId: user.id }, tx);
    return user;
  });
}

export async function createCustomer(
  data: createCustomerData,
  audit?: AuditDescriptor,
) {
  const createArgs = {
    data: {
      name: data.name,
      cpf: data.cpf,
      email: data.email,
      passwordHash: data.passwordHash,
      roles: {
        create: data.roleNames.map((name) => ({
          role: { connect: { name } },
        })),
      },
      customer: {
        create: {
          phone: data.phone,
        },
      },
    },
    include: userInclude,
  };

  if (!audit) return prisma.user.create(createArgs);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create(createArgs);
    await record({ ...audit, targetId: user.id }, tx);
    return user;
  });
}

export async function updateUser(id: string, data: updateUserData) {
  return prisma.user.update({
    where: { id, deletedAt: null },
    data: {
      ...(data.name && { name: data.name }),
      ...(data.email && { email: data.email }),
    },
    include: userInclude,
  });
}

export async function softDeleteUserAndInvalidateSessions(
  userId: string,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { invalidatedAt: new Date() },
    });
    const user = await tx.user.update({
      where: { id: userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (audit) await record(audit, tx);
    return user;
  });
}

export async function banUserAndInvalidateSessions(
  userId: string,
  bannedBy: string,
  reason: string,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId, deletedAt: null },
      data: { bannedAt: new Date(), bannedBy, banReason: reason },
    });
    await tx.session.updateMany({
      where: {
        userId,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { invalidatedAt: new Date() },
    });
    if (audit) await record(audit, tx);
    return user;
  });
}

export async function unbanUser(userId: string, audit?: AuditDescriptor) {
  const updateArgs = {
    where: { id: userId, deletedAt: null },
    data: { bannedAt: null, bannedBy: null, banReason: null },
  };

  if (!audit) return prisma.user.update(updateArgs);

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update(updateArgs);
    await record(audit, tx);
    return user;
  });
}

export async function findDeletedUserById(id: string) {
  return prisma.user.findFirst({
    where: { id, deletedAt: { not: null } },
    include: userInclude,
  });
}

export async function getUserForFeatureComputation(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    include: {
      roles: {
        where: { deletedAt: null },
        include: {
          role: {
            include: {
              features: { include: { feature: true } },
            },
          },
        },
      },
      features: {
        where: { deletedAt: null },
        include: { feature: true },
      },
    },
  });
}
