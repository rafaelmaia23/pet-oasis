import type { Prisma } from "@/generated/prisma/client";
import type { ProfileKind } from "@/generated/prisma/enums";

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
 * as contagens que o audit precisa, e a restauração não é simétrica à deleção
 * (D6': desce quatro níveis, sobe dois), coisa que uma trigger de propagação
 * genérica não expressaria.
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

// ─── Restauração (D5 + D6') ──────────────────────────────────────────────────
//
// Uma regra só: **restaura o filho cujo `deletedAt` é igual ao do pai**. O que
// morreu noutro instante — removido de propósito, ou recusado pelo admin num
// ciclo anterior — simplesmente não bate, e continua morto sem precisar de
// nenhuma regra extra.
//
// **A restauração sobe dois níveis, a deleção desce quatro (D6', K16).** A
// cascata vai até o `UserFeature`; a restauração para na `UserRole`. Não é
// descuido: deletar demais é fail-closed, restaurar demais é vazamento de
// privilégio — e quem devolve um cargo a alguém frequentemente não sabe que
// havia ajuste fino pendurado nele. Override volta só por ação explícita
// (`upsertUserFeature`, que revive a linha soft-deletada). A linha morta fica
// como evidência para o audit; ela apenas nunca volta sozinha.
//
// A ordem importa: **ler o `deletedAt` do pai antes de zerá-lo**. Se o pai for
// zerado primeiro, a chave de comparação dos filhos se perde e a restauração
// vira um no-op silencioso.

type RestoreCounts = {
  roles: number;
};

/**
 * Concede as roles ao usuário **reusando a linha do par** `(userId, roleId)`
 * (D3). Uma linha morta é revivida; ausente, criada. Já ativa, é no-op.
 *
 * Existe como primitiva porque três caminhos precisam dela e um `create` cru
 * estoura o `@@unique([userId, roleId])` sempre que já houve aquele par:
 * `addUserRole`, a criação de perfil, e a reativação de perfil nomeando uma role
 * que morreu **fora** da cascata daquele perfil (K15) — que é justamente o caso
 * em que a correlação por data não casa e a role tem de ser concedida, não
 * restaurada.
 */
export async function grantRolesToUser(
  tx: Prisma.TransactionClient,
  userId: string,
  roleIds: string[],
): Promise<number> {
  if (roleIds.length === 0) return 0;

  const existing = await tx.userRole.findMany({
    where: { userId, roleId: { in: roleIds } },
    select: { id: true, roleId: true },
  });

  const existingByRoleId = new Map(
    existing.map((userRole) => [userRole.roleId, userRole.id]),
  );

  for (const roleId of roleIds) {
    const existingId = existingByRoleId.get(roleId);

    if (existingId) {
      await tx.userRole.update({
        where: { id: existingId },
        data: { deletedAt: null },
      });
    } else {
      await tx.userRole.create({ data: { userId, roleId } });
    }
  }

  return roleIds.length;
}

/**
 * Restaura as `UserRole` que morreram no instante `parentDeletedAt` — e nada
 * abaixo delas (D6').
 *
 * `roleIds` estreita para um subconjunto (D8): o que ficar de fora mantém o
 * `deletedAt` antigo e, por construção, não volta em nenhum ciclo futuro.
 */
export async function restoreRolesOfProfile(
  tx: Prisma.TransactionClient,
  userId: string,
  appliesTo: ProfileKind,
  parentDeletedAt: Date,
  options: { roleIds?: string[] },
): Promise<RestoreCounts> {
  const { count } = await tx.userRole.updateMany({
    where: {
      userId,
      deletedAt: parentDeletedAt,
      role: { appliesTo },
      ...(options.roleIds && { roleId: { in: options.roleIds } }),
    },
    data: { deletedAt: null },
  });

  return { roles: count };
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
  },
): Promise<RestoreCounts & { profiles: ProfileKind[] }> {
  const result: RestoreCounts & { profiles: ProfileKind[] } = {
    profiles: [],
    roles: 0,
  };

  for (const kind of options.kinds) {
    const restored = await restoreProfile(tx, userId, kind, {
      ...options,
      requireDeletedAt: userDeletedAt,
    });

    if (!restored) continue;

    result.profiles.push(restored.kind);
    result.roles += restored.roles;
  }

  return result;
}
