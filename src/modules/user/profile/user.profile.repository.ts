import type { ProfileKind } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import {
  type CascadeCounts,
  cascadeDeleteProfile,
} from "@/modules/user/user.lifecycle.repository";
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

/**
 * Deleta o perfil e cascateia para as roles daquele `appliesTo` **e os
 * overrides pendurados nelas** (D1/D2), com um único timestamp (D4). O audit
 * chega como thunk porque as contagens só existem dentro da transação.
 */
function deleteProfile(
  userId: string,
  kind: ProfileKind,
  describeAudit?: (counts: CascadeCounts) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const deletedAt = new Date();

    const counts = await cascadeDeleteProfile(tx, userId, kind, deletedAt);

    if (describeAudit) await record(describeAudit(counts), tx);

    return counts;
  });
}

export function deleteCustomerProfile(
  userId: string,
  describeAudit?: (counts: CascadeCounts) => AuditDescriptor,
) {
  return deleteProfile(userId, "CUSTOMER", describeAudit);
}

export function deleteEmployeeProfile(
  userId: string,
  describeAudit?: (counts: CascadeCounts) => AuditDescriptor,
) {
  return deleteProfile(userId, "EMPLOYEE", describeAudit);
}
