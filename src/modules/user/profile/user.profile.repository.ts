import type { ProfileKind } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import {
  type CascadeCounts,
  cascadeDeleteProfile,
  grantRolesToUser,
  restoreProfile,
} from "@/modules/user/user.lifecycle.repository";
import { userInclude } from "@/modules/user/user.repository";

type createCustomerProfileData = {
  phone: string;
  address?: string | undefined;
  birthDate?: Date | undefined;
};

/**
 * Cria o perfil e concede as roles pela primitiva de reuso de linha (D3), não
 * por `roles: { create: ... }` aninhado: o nested write estoura o
 * `@@unique([userId, roleId])` sempre que já houve aquele par, e o `create` cru
 * não tem como saber disso.
 */
export async function createCustomerProfile(
  userId: string,
  data: createCustomerProfileData,
  roleIds: string[],
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.customer.create({
      data: {
        userId,
        phone: data.phone,
        ...(data.address && { address: data.address }),
        ...(data.birthDate && { birthDate: data.birthDate }),
      },
    });

    await grantRolesToUser(tx, userId, roleIds);

    if (audit) await record(audit, tx);

    return tx.user.findUniqueOrThrow({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
  });
}

export async function createEmployeeProfile(
  userId: string,
  roleIds: string[],
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.employee.create({ data: { userId } });

    await grantRolesToUser(tx, userId, roleIds);

    if (audit) await record(audit, tx);

    return tx.user.findUniqueOrThrow({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
  });
}

/**
 * Reativa o perfil soft-deletado (§5.1) com **exatamente** as roles pedidas
 * (K15) — a mesma semântica de criar.
 *
 * Os dois passos existem porque uma role nomeada pode estar em dois estados
 * diferentes, e só um deles é restauração:
 *
 * 1. morreu **nesta** cascata (`deletedAt` igual ao do perfil) → volta por
 *    correlação de data (D5), junto do perfil;
 * 2. morreu noutro instante, ou nunca existiu → não casa com nada, então é
 *    **concedida** reusando a linha do par (D3).
 *
 * Sem `roleIds`, vale o default do D8: volta tudo o que morreu na cascata, e o
 * passo 2 não tem o que fazer.
 *
 * Nenhum override volta em nenhum dos dois passos (D6').
 */
export async function reactivateProfile(
  userId: string,
  kind: ProfileKind,
  options: { roleIds?: string[]; phone?: string },
  describeAudit?: (counts: { restoredRoles: number }) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const restored = await restoreProfile(tx, userId, kind, {
      ...(options.roleIds && { roleIds: options.roleIds }),
    });

    if (options.roleIds) {
      await grantRolesToUser(tx, userId, options.roleIds);
    }

    // O `POST` é o único caminho que grava `Customer.phone`, então na
    // reativação ele atualiza em vez de ser ignorado.
    if (kind === "CUSTOMER" && options.phone) {
      await tx.customer.update({
        where: { userId },
        data: { phone: options.phone },
      });
    }

    if (describeAudit) {
      await record(describeAudit({ restoredRoles: restored?.roles ?? 0 }), tx);
    }

    return tx.user.findUniqueOrThrow({
      where: { id: userId, deletedAt: null },
      include: userInclude,
    });
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
