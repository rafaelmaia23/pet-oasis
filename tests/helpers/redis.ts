import { redis } from "@/lib/redis";

// Isola contadores de rate limit/lockout entre testes — mesmo papel que
// `clearDatabase()` cumpre para o Postgres.
export async function flushRedis() {
  await redis.flushdb();
}
