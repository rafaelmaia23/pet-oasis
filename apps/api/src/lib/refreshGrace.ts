import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { hashToken } from "@/lib/token";
import { REFRESH_GRACE_WINDOW_MS } from "@/modules/auth/auth.constants";

/**
 * Janela de graça da rotação do refresh (10.7) — o par emitido numa rotação,
 * guardado pelo tempo da janela e chaveado pelo **hash do token apresentado**,
 * para que uma segunda apresentação do mesmo token dentro da janela receba o
 * mesmo par em vez de ser lida como roubo.
 *
 * Duas escolhas que sustentam o resto:
 *
 * - **A janela é o TTL**, não uma comparação de timestamp para decidir o que
 *   devolver. O que existe no Redis é replicável; o que expirou, não. Nenhum
 *   relógio precisa concordar com outro.
 * - **A chave é o hash**, nunca o token cru — mesmo motivo pelo qual `Session`
 *   guarda `sha256(token)` e não o token. O **valor**, sim, é o par em texto
 *   claro: é o que se precisa devolver, e é por isso que ele vive dez segundos
 *   e não mais.
 */

const log = logger.child({ module: "refreshGrace" });

export type TokenPair = { accessToken: string; refreshToken: string };

/**
 * O que o cache tinha a dizer. `MISS` e `UNAVAILABLE` levam ao mesmo 503, mas
 * são diagnósticos diferentes: `UNAVAILABLE` é Redis fora do ar; `MISS`, se
 * recorrente, é evicção por limite de memória com o Redis vivo.
 */
export type GraceLookup =
  | { status: "HIT"; pair: TokenPair }
  | { status: "MISS" }
  | { status: "UNAVAILABLE" };

/**
 * O estado de um elo, do ponto de vista de quem quer servir o par dele. Quem
 * responde é o service (só o repository fala com o Prisma); a caminhada abaixo
 * só decide o que fazer com a resposta.
 *
 * - `LIVE` — não usado, não invalidado, não expirado: é a ponta da corrente, e
 *   o par dele é o que o cliente precisa receber.
 * - `ROTATED` — já foi usado: a corrente seguiu adiante, e é preciso segui-la.
 * - `DEAD` — invalidado, expirado ou inexistente: não há par a servir.
 */
export type GraceLinkState = "LIVE" | "ROTATED" | "DEAD";

/**
 * `hops` conta quantos saltos a corrente pediu: `0` é o caso ordinário (o par
 * do elo apresentado ainda é a ponta), e `> 0` é o cliente que ficou atrás — é
 * o único jeito de saber em produção se esse caminho roda.
 *
 * `STALE` é "a corrente existe, mas não há ponta viva a servir". Não é falha de
 * infraestrutura, então **não** vira 503: cai no caminho de sempre.
 */
export type GraceChainLookup =
  | { status: "HIT"; pair: TokenPair; hops: number }
  | { status: "STALE"; hops: number }
  | { status: "MISS" }
  | { status: "UNAVAILABLE" };

/**
 * Teto de saltos da corrente. Existe para **limitar o laço**, não para modelar
 * o cliente: em dez segundos cabem mais rotações do que isto, e quem passar do
 * teto cai no caminho de sempre em vez de receber um elo vencido.
 */
export const REFRESH_GRACE_MAX_CHAIN_HOPS = 5;

export function refreshGraceKey(refreshTokenHash: string): string {
  return `refresh:grace:${refreshTokenHash}`;
}

function parsePair(raw: string): TokenPair | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as TokenPair).accessToken === "string" &&
      typeof (parsed as TokenPair).refreshToken === "string"
    ) {
      const { accessToken, refreshToken } = parsed as TokenPair;
      return { accessToken, refreshToken };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Guarda o par emitido. **Best-effort**: uma falha aqui não pode derrubar a
 * renovação — o cliente ficaria sem o par novo por causa de um cache cuja
 * única função é socorrer a *próxima* requisição.
 */
export async function rememberPair(
  presentedTokenHash: string,
  pair: TokenPair,
): Promise<void> {
  try {
    await redis.set(
      refreshGraceKey(presentedTokenHash),
      JSON.stringify(pair),
      "PX",
      REFRESH_GRACE_WINDOW_MS,
    );
  } catch (error) {
    log.error(
      { err: error },
      "refresh grace store unavailable, pair not cached",
    );
  }
}

export async function lookupPair(
  presentedTokenHash: string,
): Promise<GraceLookup> {
  let raw: string | null;

  try {
    raw = await redis.get(refreshGraceKey(presentedTokenHash));
  } catch (error) {
    log.error({ err: error }, "refresh grace store unavailable");
    return { status: "UNAVAILABLE" };
  }

  if (raw === null) {
    return { status: "MISS" };
  }

  const pair = parsePair(raw);

  // Valor ilegível é tratado como ausente: o Redis respondeu, mas não há par a
  // devolver — mesma conclusão, mesmo 503.
  return pair ? { status: "HIT", pair } : { status: "MISS" };
}

/**
 * O par da **ponta viva** da corrente, a partir do token apresentado.
 *
 * Existe porque devolver o par do elo apresentado, cru, tem dois furos. Se
 * aquele par já foi rotacionado dentro da mesma janela — cliente com prefetch
 * faz isso —, o retardatário recebe um refresh token já usado, volta um elo e
 * leva a cascata de roubo na renovação seguinte. E se o par pertence a uma
 * sessão que um logout acabou de fechar, devolvê-lo reabriria por dez segundos
 * o que a API acabou de encerrar: a linha apresentada nada diz sobre o estado
 * da linha **seguinte**, que é a que se vai servir.
 *
 * Por isso cada elo é conferido antes de servir, e a corrente é seguida
 * enquanto ela tiver seguido adiante. O cache dá o caminho; `classifyLink` dá o
 * direito de trafegar nele.
 *
 * Falha de infraestrutura no meio da caminhada devolve `UNAVAILABLE`, nunca
 * `STALE`: o invariante do módulo é que Redis fora do ar não derruba sessão de
 * ninguém.
 *
 * Recusados: **não fazer nada** (o sintoma é deslogar de tudo, e ninguém
 * consegue reproduzir) e **responder 503 ao ver o elo vencido** (o 503 deste
 * módulo promete ser retentável, e ali a retentativa também falharia).
 */
export async function lookupServeablePair(
  presentedTokenHash: string,
  classifyLink: (refreshTokenHash: string) => Promise<GraceLinkState>,
): Promise<GraceChainLookup> {
  const first = await lookupPair(presentedTokenHash);

  if (first.status !== "HIT") {
    return first;
  }

  let pair = first.pair;
  let hops = 0;

  for (;;) {
    const nextHash = hashToken(pair.refreshToken);
    const state = await classifyLink(nextHash);

    if (state === "LIVE") {
      return { status: "HIT", pair, hops };
    }

    if (state === "DEAD" || hops >= REFRESH_GRACE_MAX_CHAIN_HOPS) {
      return { status: "STALE", hops };
    }

    const next = await lookupPair(nextHash);

    // Corrente interrompida (`MISS`) é `STALE`; Redis que caiu no meio da
    // caminhada continua sendo falha de infraestrutura, e sai como tal.
    if (next.status === "UNAVAILABLE") {
      return { status: "UNAVAILABLE" };
    }

    if (next.status === "MISS") {
      return { status: "STALE", hops };
    }

    pair = next.pair;
    hops += 1;
  }
}
