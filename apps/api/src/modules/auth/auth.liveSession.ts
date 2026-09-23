import type { Prisma } from "@/generated/prisma/client";

/**
 * **Sessão viva** — o termo do glossário (`apps/api/CONTEXT.md`, seção Sessão)
 * escrito uma vez só: `Session` com `usedAt` e `invalidatedAt` nulos e
 * `expiresAt` no futuro. É o que `GET /auth/sessions` lista, o que o teto de
 * sessões conta antes de despejar a mais velha, e o que `DELETE
 * /auth/sessions/:id` aceita revogar.
 *
 * Existe porque as três cláusulas viviam copiadas em oito consultas — cinco
 * com as três, três com duas —, e uma cópia divergente aqui não é detalhe de
 * estilo: é a forma de a API listar como viva uma sessão que já morreu, ou de
 * deixar de derrubar uma que devia cair.
 *
 * **Ler e derrubar não recortam o mesmo conjunto, e isso é de propósito.**
 * Derrubar alcança um elo a mais: o já **rotacionado** (`usedAt` preenchido),
 * que não é uma sessão viva mas ainda tem uma porta aberta — a janela de graça
 * da rotação (`apps/api/docs/adr/0057-janela-graca-10s-rotacao.md`) só socorre
 * o elo cujo `invalidatedAt` é nulo. Um ban, um reset ou uma cascata de roubo
 * que deixasse o elo rotacionado sem marca reabriria por dez segundos o que
 * acabou de fechar — e, com o Redis fora do ar, responderia 503 ("tente
 * novamente agora") para uma sessão que nunca mais volta. Daí os dois filtros,
 * um derivado do outro pela remoção **explícita** de uma cláusula, em vez de
 * duas grafias que ninguém sabe dizer se divergem.
 *
 * Camada: é peça de repository — quem chama `invalidateSessionsOfUser` passa o
 * cliente, e o módulo nunca vai buscar o Prisma sozinho. O predicado
 * `isLiveSession` é puro e pode ser usado pelo service.
 */

/** O que a definição precisa saber de uma linha de `Session`, e nada mais. */
export type SessionLifecycle = {
  usedAt: Date | null;
  invalidatedAt: Date | null;
  expiresAt: Date;
};

type LiveSessionWhere = {
  usedAt: null;
  invalidatedAt: null;
  expiresAt: { gt: Date };
};

type ReachableSessionWhere = {
  invalidatedAt: null;
  expiresAt: { gt: Date };
};

/** A sessão viva, na forma que o Prisma entende. */
export function liveSessionWhere(now: Date = new Date()): LiveSessionWhere {
  return { usedAt: null, invalidatedAt: null, expiresAt: { gt: now } };
}

/** A sessão viva de um usuário — o recorte que toda leitura usa. */
export function liveSessionsOfUserWhere(
  userId: string,
  now: Date = new Date(),
): LiveSessionWhere & { userId: string } {
  return { userId, ...liveSessionWhere(now) };
}

/**
 * O que a invalidação alcança: a sessão viva **mais** o elo já rotacionado que
 * ainda não foi morto. É `liveSessionsOfUserWhere` sem `usedAt` — superconjunto
 * por construção, e não por coincidência de dois literais parecidos.
 */
export function reachableSessionsOfUserWhere(
  userId: string,
  now: Date = new Date(),
): ReachableSessionWhere & { userId: string } {
  const { usedAt: _rotationIsNotAnEscape, ...reachable } =
    liveSessionsOfUserWhere(userId, now);

  return reachable;
}

/** A mesma definição, para uma linha que já está em memória. */
export function isLiveSession(
  session: SessionLifecycle,
  now: Date = new Date(),
): boolean {
  return (
    session.usedAt === null &&
    session.invalidatedAt === null &&
    session.expiresAt > now
  );
}

/**
 * Derruba toda sessão viva deste usuário — e, junto, os elos rotacionados que
 * a janela de graça ainda alcançaria. A operação de ban, deleção, reset de
 * senha, troca de senha e cascata de reuso de refresh.
 *
 * `at` é obrigatório porque quase todo chamador roda dentro de uma transação
 * que tem um `new Date()` só, propagado por toda a cadeia (a mesma regra da
 * cascata de deleção em `user.lifecycle.repository.ts`): o instante é do
 * chamador, não desta função. Ele é o corte do prazo **e** a marca gravada —
 * uma sessão que expira depois de `at` morre por invalidação; a que já expirou
 * não é remarcada, porque marcá-la não mudaria resposta nenhuma.
 */
export async function invalidateSessionsOfUser(
  client: Prisma.TransactionClient,
  userId: string,
  at: Date,
): Promise<{ count: number }> {
  return client.session.updateMany({
    where: reachableSessionsOfUserWhere(userId, at),
    data: { invalidatedAt: at },
  });
}
