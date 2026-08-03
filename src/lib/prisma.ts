import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/config/env";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // 7.12 — o projeto usa o driver adapter (`@prisma/adapter-pg`), não o pool
  // nativo do Prisma: os parâmetros clássicos de URL (`connection_limit`,
  // `pool_timeout`) não são lidos por este caminho. O timeout de aquisição de
  // conexão é um campo irmão de `connectionString` no `pg.PoolConfig`
  // (`connectionTimeoutMillis`) — sem ele, o default do `pg-pool` é
  // efetivamente ilimitado (0), exatamente o footgun que esta sub-fase fecha.
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: env.DB_POOL_CONNECT_TIMEOUT_MS,
  });

  return new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // Aplica a toda `$transaction()` da app (repositories fazem writes numa
    // transação, ver CLAUDE.md) — sem isto, uma transação presa contra um
    // Postgres lento nunca solta a conexão do pool.
    transactionOptions: {
      maxWait: env.PRISMA_TX_MAX_WAIT_MS,
      timeout: env.PRISMA_TX_TIMEOUT_MS,
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
