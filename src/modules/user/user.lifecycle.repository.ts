import type { Prisma } from "@/generated/prisma/client";
import type { ProfileKind } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";

/**
 * Ciclo de vida do grafo do usuário — `User` → perfis → `UserRole` →
 * `UserFeature` (D1).
 *
 * Mora num arquivo próprio porque a cadeia **cruza módulos** (`user` e
 * `permission`): deixá-la espalhada faria cada repositório enxergar só um elo, e
 * é justamente o elo inteiro que precisa de nome.
 *
 * Duas regras valem para todas as funções daqui:
 *
 * 1. São **`tx`-escopadas** — quem abre a `$transaction` continua sendo o
 *    repositório de cada módulo. Aqui só moram os passos.
 * 2. **Nenhuma chama `new Date()`.** O timestamp entra por parâmetro, um só por
 *    transação (D4). É essa igualdade que a restauração usa como chave de
 *    correlação (D5) — se ela vazar, o bug é silencioso.
 *
 * Por que não deixar o banco cascatear: `onDelete: Cascade` é ação referencial
 * de *hard delete* e a linha pai aqui não é apagada (é um UPDATE de
 * `deleted_at`). Trigger foi recusada — o Prisma não a gerencia, ela não devolve
 * as contagens que o audit precisa, e a restauração não caberia nela, porque o
 * filtro de não-escalação (D16) depende do ator, que o banco não conhece.
 */

export type CascadeCounts = {
  profiles: number;
  roles: number;
  overrides: number;
};

/** Último elo da cadeia: os overrides pendurados nas `UserRole` informadas. */
export async function cascadeDeleteOverrides(
  tx: Prisma.TransactionClient,
  userRoleIds: string[],
  deletedAt: Date,
): Promise<number> {
  if (userRoleIds.length === 0) return 0;

  const { count } = await tx.userFeature.updateMany({
    where: { userRoleId: { in: userRoleIds }, deletedAt: null },
    data: { deletedAt },
  });

  return count;
}

/**
 * Mata as `UserRole` ativas do usuário — todas, ou só as de um `appliesTo` — e
 * os overrides pendurados nelas.
 *
 * Os ids são capturados **antes** de marcar as roles: depois disso o filtro
 * `deletedAt: null` do nível de baixo não casaria mais.
 */
export async function cascadeDeleteRoles(
  tx: Prisma.TransactionClient,
  target: { userId: string; appliesTo?: ProfileKind },
  deletedAt: Date,
): Promise<{ roles: number; overrides: number }> {
  const activeRoles = await tx.userRole.findMany({
    where: {
      userId: target.userId,
      deletedAt: null,
      ...(target.appliesTo && { role: { appliesTo: target.appliesTo } }),
    },
    select: { id: true },
  });

  if (activeRoles.length === 0) return { roles: 0, overrides: 0 };

  const userRoleIds = activeRoles.map((userRole) => userRole.id);

  const overrides = await cascadeDeleteOverrides(tx, userRoleIds, deletedAt);

  const { count: roles } = await tx.userRole.updateMany({
    where: { id: { in: userRoleIds } },
    data: { deletedAt },
  });

  return { roles, overrides };
}

/**
 * Mata o perfil e desce para as roles daquele `appliesTo`. O `updateMany` no
 * perfil é proposital: perfil já morto não é tocado e mantém o timestamp antigo.
 */
export async function cascadeDeleteProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: ProfileKind,
  deletedAt: Date,
): Promise<CascadeCounts> {
  const { count: profiles } =
    kind === "CUSTOMER"
      ? await tx.customer.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt },
        })
      : await tx.employee.updateMany({
          where: { userId, deletedAt: null },
          data: { deletedAt },
        });

  const { roles, overrides } = await cascadeDeleteRoles(
    tx,
    { userId, appliesTo: kind },
    deletedAt,
  );

  return { profiles, roles, overrides };
}

/**
 * Mata o grafo inteiro sob a conta. As roles vão **sem** filtro de `appliesTo`:
 * o pai aqui é a conta, e D1 não admite filho ativo de pai morto.
 */
export async function cascadeDeleteUserGraph(
  tx: Prisma.TransactionClient,
  userId: string,
  deletedAt: Date,
): Promise<CascadeCounts> {
  const [{ count: customers }, { count: employees }] = await Promise.all([
    tx.customer.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt },
    }),
    tx.employee.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt },
    }),
  ]);

  const { roles, overrides } = await cascadeDeleteRoles(
    tx,
    { userId },
    deletedAt,
  );

  return { profiles: customers + employees, roles, overrides };
}

// ─── Restauração (D5) ────────────────────────────────────────────────────────
//
// Uma regra só, aplicada nos três níveis: **restaura o filho cujo `deletedAt` é
// igual ao do pai**. O que morreu noutro instante — removido de propósito, ou
// recusado pelo admin num ciclo anterior — simplesmente não bate, e continua
// morto sem precisar de nenhuma regra extra.
//
// A ordem importa: **ler o `deletedAt` do pai antes de zerá-lo**. Se o pai for
// zerado primeiro, a chave de comparação dos filhos se perde e a restauração
// vira um no-op silencioso.

/**
 * Política de restauração de override (D6 + D16). Ambas as pontas são regra de
 * negócio, então moram no service e chegam aqui como função: o repositório sabe
 * *que* precisa filtrar e auditar, não *qual* é o critério.
 */
export type OverrideRestorePolicy = {
  /** `false` → o override fica morto para sempre (§9.1.1 do redesenho). */
  canRestore: (featureName: string) => boolean;
  /** Descritor do audit de descarte, um por override pulado (K3). */
  describeSkip: (featureName: string) => AuditDescriptor;
};

type RestoreCounts = {
  roles: number;
  overrides: number;
  skipped: string[];
};

/** Restaura os overrides que morreram no mesmo instante que a `UserRole`. */
export async function restoreOverridesOfUserRole(
  tx: Prisma.TransactionClient,
  userRole: { id: string; deletedAt: Date | null },
  policy: OverrideRestorePolicy,
): Promise<{ restored: number; skipped: string[] }> {
  if (userRole.deletedAt === null) return { restored: 0, skipped: [] };

  const candidates = await tx.userFeature.findMany({
    where: { userRoleId: userRole.id, deletedAt: userRole.deletedAt },
    include: { feature: true },
  });

  const restorable: string[] = [];
  const skipped: string[] = [];

  for (const override of candidates) {
    policy.canRestore(override.feature.name)
      ? restorable.push(override.id)
      : skipped.push(override.feature.name);
  }

  if (restorable.length > 0) {
    await tx.userFeature.updateMany({
      where: { id: { in: restorable } },
      data: { deletedAt: null },
    });
  }

  // O descarte é silencioso na resposta: o audit é o único rastro dele.
  for (const featureName of skipped) {
    await record(policy.describeSkip(featureName), tx);
  }

  return { restored: restorable.length, skipped };
}

/**
 * Restaura as `UserRole` que morreram no instante `parentDeletedAt`, descendo
 * para os overrides de cada uma antes de zerá-la.
 *
 * `roleIds` estreita para um subconjunto (D8): o que ficar de fora mantém o
 * `deletedAt` antigo e, por construção, não volta em nenhum ciclo futuro.
 */
export async function restoreRolesOfProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  appliesTo: ProfileKind,
  parentDeletedAt: Date,
  options: { roleIds?: string[]; policy: OverrideRestorePolicy },
): Promise<RestoreCounts> {
  const candidates = await tx.userRole.findMany({
    where: {
      userId,
      deletedAt: parentDeletedAt,
      role: { appliesTo },
      ...(options.roleIds && { roleId: { in: options.roleIds } }),
    },
    select: { id: true, deletedAt: true },
  });

  const counts: RestoreCounts = { roles: 0, overrides: 0, skipped: [] };

  for (const userRole of candidates) {
    const { restored, skipped } = await restoreOverridesOfUserRole(
      tx,
      userRole,
      options.policy,
    );

    await tx.userRole.update({
      where: { id: userRole.id },
      data: { deletedAt: null },
    });

    counts.roles += 1;
    counts.overrides += restored;
    counts.skipped.push(...skipped);
  }

  return counts;
}

/**
 * Restaura o perfil e desce para as roles dele. Devolve `null` quando não há
 * perfil morto para restaurar.
 *
 * `requireDeletedAt` amarra a restauração a um instante exato — é o que a
 * reativação de **conta** usa, para trazer só o perfil que morreu na cascata
 * dela. Sem ele, qualquer perfil morto serve, que é o caso da reativação de
 * perfil em conta viva (8.3).
 */
export async function restoreProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: ProfileKind,
  options: {
    requireDeletedAt?: Date;
    roleIds?: string[];
    policy: OverrideRestorePolicy;
  },
): Promise<(RestoreCounts & { kind: ProfileKind }) | null> {
  const where = {
    userId,
    deletedAt: options.requireDeletedAt ?? { not: null },
  };

  const profile =
    kind === "CUSTOMER"
      ? await tx.customer.findFirst({
          where,
          select: { id: true, deletedAt: true },
        })
      : await tx.employee.findFirst({
          where,
          select: { id: true, deletedAt: true },
        });

  if (!profile?.deletedAt) return null;

  const counts = await restoreRolesOfProfile(
    tx,
    userId,
    kind,
    profile.deletedAt,
    options,
  );

  if (kind === "CUSTOMER") {
    await tx.customer.update({
      where: { id: profile.id },
      data: { deletedAt: null },
    });
  } else {
    await tx.employee.update({
      where: { id: profile.id },
      data: { deletedAt: null },
    });
  }

  return { ...counts, kind };
}

/**
 * Restaura, entre os perfis pedidos, apenas os que morreram **junto com a
 * conta**. Um perfil que já estava morto antes tem outro `deletedAt` e não vem
 * de carona — quem o quiser de volta pede explicitamente.
 *
 * A linha do `User` não é tocada aqui: quem reativa a conta é o repositório de
 * user, que precisa ler `user.deletedAt` (a chave passada aqui) antes de zerá-la.
 */
export async function restoreProfilesOfUser(
  tx: Prisma.TransactionClient,
  userId: string,
  userDeletedAt: Date,
  options: {
    kinds: ProfileKind[];
    roleIds?: string[];
    policy: OverrideRestorePolicy;
  },
): Promise<RestoreCounts & { profiles: ProfileKind[] }> {
  const result: RestoreCounts & { profiles: ProfileKind[] } = {
    profiles: [],
    roles: 0,
    overrides: 0,
    skipped: [],
  };

  for (const kind of options.kinds) {
    const restored = await restoreProfile(tx, userId, kind, {
      ...options,
      requireDeletedAt: userDeletedAt,
    });

    if (!restored) continue;

    result.profiles.push(restored.kind);
    result.roles += restored.roles;
    result.overrides += restored.overrides;
    result.skipped.push(...restored.skipped);
  }

  return result;
}
