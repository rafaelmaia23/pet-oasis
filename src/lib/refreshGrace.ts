import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
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
