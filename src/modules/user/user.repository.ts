import type { Prisma } from "@/generated/prisma/client";
import type { UserStatus } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import type { RoleName } from "../role/role.constants";
import {
  type CascadeCounts,
  cascadeDeleteUserGraph,
} from "./user.lifecycle.repository";

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
      // Overrides pendurados na atribuição de role (D2): não existe mais
      // `user.features`, e um override de role morta nunca é alcançado.
      features: {
        where: { deletedAt: null },
        include: { feature: true },
      },
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

export type UserListFilters = {
  status?: UserStatus | undefined;
  banned?: boolean | undefined;
  role?: string | undefined;
};

export async function findAllUsers(
  filters: UserListFilters,
  pagination: { skip: number; take: number },
) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.banned === undefined
      ? {}
      : { bannedAt: filters.banned ? { not: null } : null }),
    ...(filters.role
      ? { roles: { some: { deletedAt: null, role: { name: filters.role } } } }
      : {}),
  };

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: userInclude,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total };
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

/**
 * Encerra a conta e **cascateia** para o grafo inteiro (D1): perfis, roles e
 * overrides. Um único `new Date()` para toda a transação (D4) — é a igualdade
 * desses timestamps que a restauração (8.2) usa como chave.
 *
 * O audit chega como thunk, e não como descritor pronto, porque as contagens da
 * cascata só existem dentro da transação (mesmo idioma do `removeUserRole`).
 */
export async function softDeleteUserAndInvalidateSessions(
  userId: string,
  describeAudit?: (counts: CascadeCounts) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const deletedAt = new Date();

    await tx.session.updateMany({
      where: {
        userId,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: deletedAt },
      },
      data: { invalidatedAt: deletedAt },
    });
    const user = await tx.user.update({
      where: { id: userId, deletedAt: null },
      data: { deletedAt },
    });

    const counts = await cascadeDeleteUserGraph(tx, userId, deletedAt);

    if (describeAudit) await record(describeAudit(counts), tx);
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

export async function forcePasswordResetAndInvalidateSessions(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId, deletedAt: null },
      data: { mustChangePassword: true },
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
    await tx.verificationToken.create({
      data: { userId, tokenHash, purpose: "PASSWORD_RESET", expiresAt },
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

export async function findDeletedUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, deletedAt: { not: null } },
    include: userInclude,
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
          features: {
            where: { deletedAt: null },
            include: { feature: true },
          },
        },
      },
    },
  });
}
