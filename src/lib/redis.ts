import Redis from "ioredis";
import { env } from "@/config/env";

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
 * TODO(7.5): trocar o `console.error` pelo logger do módulo.
 * TODO(7.13): `connectTimeout`/`commandTimeout` entram junto com os demais
 * timeouts — sem eles, um Redis que aceita a conexão e não responde ainda
 * penduraria o request pelo timeout de socket do SO.
 */
export const redis = new Redis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) =>
    Math.min(times * RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS),
});

redis.on("error", (error: unknown) => {
  console.error("Redis connection error:", error);
});

/** Encerra a conexão no shutdown gracioso. Idempotente. */
export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
