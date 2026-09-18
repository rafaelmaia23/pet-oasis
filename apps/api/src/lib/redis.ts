import Redis from "ioredis";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "redis" });

/** Backoff entre tentativas de reconexão, limitado para não inundar o log. */
const RECONNECT_BASE_DELAY_MS = 200;
const RECONNECT_MAX_DELAY_MS = 5_000;

/**
 * Client Redis compartilhado (rate limiting na 7.10, lockout na 7.11).
 *
 * Configurado para **falhar rápido**: é o que torna o fail-open (D2) real. Sem
 * `enableOfflineQueue: false`, um comando contra um Redis fora do ar ficaria
 * enfileirado esperando reconexão — e penduraria o login em vez de deixar o
 * chamador seguir sem o limitador.
 *
 * O listener de `error` só loga: o Redis nunca pode derrubar o boot nem o
 * processo. Falha de conexão é anomalia observável, não motivo de crash.
 *
 * `connectTimeout`/`commandTimeout` (7.12) fecham a última lacuna do
 * fail-open: sem eles, um Redis que aceita a conexão TCP mas nunca responde
 * pendura pelo timeout de socket do SO em vez de falhar rápido.
 */
export const redis = new Redis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
  commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
  retryStrategy: (times) =>
    Math.min(times * RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS),
});

redis.on("error", (error: unknown) => {
  // `error` porque alguém precisa agir: enquanto durar, rate limit e lockout
  // (7.10/7.11) estão fail-open — sem proteção, mas sem derrubar o login.
  log.error({ err: error }, "redis connection error");
});

/** Encerra a conexão no shutdown gracioso. Idempotente. */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
