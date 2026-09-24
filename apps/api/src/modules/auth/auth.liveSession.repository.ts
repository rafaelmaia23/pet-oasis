import type { Prisma } from "@/generated/prisma/client";

/**
 * **Sessão viva** — o termo do glossário (`apps/api/CONTEXT.md`, seção Sessão)
 * escrito uma vez só: `Session` com `usedAt` e `invalidatedAt` nulos e
 * `expiresAt` no futuro. É o que `GET /auth/sessions` lista, o que o teto de
 * sessões conta antes de despejar a mais velha, e o que `DELETE
 * /auth/sessions/:id` aceita revogar.
 *
 * Existe porque as três cláusulas viviam copiadas em nove lugares — cinco com
 * as três, quatro com duas —, e uma cópia divergente aqui não é detalhe de
 * estilo: é a forma de a API listar como viva uma sessão que já morreu, ou de
 * deixar de derrubar uma que devia cair.
 *
 * **Ler e derrubar não recortam o mesmo conjunto, e isso é de propósito.** Uma
 * sessão **invalidável** é a que ainda não foi morta nem expirou — duas
 * cláusulas, não três. Ela inclui o elo já **rotacionado**, que não é uma
 * sessão viva mas ainda tem uma porta aberta: a janela de graça da rotação
 * (`apps/api/docs/adr/0057-janela-graca-10s-rotacao.md`) só socorre o elo cujo
 * `invalidatedAt` é nulo. Um ban, um reset ou uma cascata de roubo que
 * deixasse o elo rotacionado sem marca reabriria por dez segundos o que
 * acabou de fechar — e, com o Redis fora do ar, responderia 503 ("tente
 * novamente agora") para uma sessão que nunca mais volta.
 *
 * Daí os dois filtros; o que garante que continuem sendo dois recortes do
 * **mesmo** conjunto é que um é construído do outro, e não redigitado: viva é
 * invalidável **mais** `usedAt` nulo, tanto no `where` quanto em memória.
 *
 * Camada: é peça de repository — quem chama `invalidateSessionsOfUser` passa o
 * cliente, e o módulo nunca vai buscar o Prisma sozinho. Os predicados são
 * puros e podem ser usados pelo service, que é o que faz o guard da graça e o
 * `LIVE` de `GET /auth/sessions` falarem da mesma coisa.
 *
 * O relógio: quem **lê** pode deixar o instante em branco, porque uma leitura
 * não precisa concordar com nenhum outro evento. Quem **derruba** é obrigado a
 * passá-lo — o instante é o corte do prazo *e* a marca gravada, e quase todo
 * chamador roda dentro de uma transação com um `new Date()` só propagado pela
 * cadeia (regra de `user.lifecycle.repository.ts`).
 */

/** O que a definição precisa saber de uma linha de `Session`, e nada mais. */
export type SessionLifecycle = {
  usedAt: Date | null;
  invalidatedAt: Date | null;
  expiresAt: Date;
};

type InvalidatableSessionWhere = {
  invalidatedAt: null;
  expiresAt: { gt: Date };
};

type LiveSessionWhere = InvalidatableSessionWhere & { usedAt: null };

/**
 * O que a invalidação alcança: ainda não foi morta e ainda não expirou. O
 * `satisfies` não é decoração — sem ele, uma coluna renomeada no schema
 * passaria batida, porque o tipo nomeado que estes construtores devolvem não
 * sofre a checagem de propriedade excedente nos `where` que os recebem.
 */
export function invalidatableSessionWhere(
  now: Date = new Date(),
): InvalidatableSessionWhere {
  return {
    invalidatedAt: null,
    expiresAt: { gt: now },
  } satisfies Prisma.SessionWhereInput;
}

/** A sessão viva: a invalidável que ainda não foi usada. */
export function liveSessionWhere(now: Date = new Date()): LiveSessionWhere {
  return {
    usedAt: null,
    ...invalidatableSessionWhere(now),
  } satisfies Prisma.SessionWhereInput;
}

/** A sessão viva de um usuário — o recorte que toda leitura usa. */
export function liveSessionsOfUserWhere(
  userId: string,
  now: Date = new Date(),
): LiveSessionWhere & { userId: string } {
  return { userId, ...liveSessionWhere(now) };
}

/** A sessão invalidável de um usuário — o recorte que toda escrita usa. */
export function invalidatableSessionsOfUserWhere(
  userId: string,
  now: Date = new Date(),
): InvalidatableSessionWhere & { userId: string } {
  return { userId, ...invalidatableSessionWhere(now) };
}

/** A mesma definição, para uma linha que já está em memória. */
export function isInvalidatableSession(
  session: Omit<SessionLifecycle, "usedAt">,
  now: Date = new Date(),
): boolean {
  return session.invalidatedAt === null && session.expiresAt > now;
}

/** Idem — e pela mesma composição do lado do `where`. */
export function isLiveSession(
  session: SessionLifecycle,
  now: Date = new Date(),
): boolean {
  return session.usedAt === null && isInvalidatableSession(session, now);
}

/**
 * Derruba toda sessão viva deste usuário — e, junto, os elos rotacionados que
 * a janela de graça ainda alcançaria. A operação de ban, deleção, reset de
 * senha, troca de senha e cascata de reuso de refresh.
 *
 * A sessão que já expirou não é remarcada, porque marcá-la não mudaria
 * resposta nenhuma; a que já foi morta guarda a data da primeira morte.
 */
export async function invalidateSessionsOfUser(
  client: Prisma.TransactionClient,
  userId: string,
  at: Date,
): Promise<{ count: number }> {
  return client.session.updateMany({
    where: invalidatableSessionsOfUserWhere(userId, at),
    data: { invalidatedAt: at },
  });
}
