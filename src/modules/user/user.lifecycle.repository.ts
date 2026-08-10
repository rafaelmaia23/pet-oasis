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
