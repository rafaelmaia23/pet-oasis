import { describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";

const { pgAdapterConstructorMock, prismaClientConstructorMock } = vi.hoisted(
  () => ({
    pgAdapterConstructorMock: vi.fn(),
    prismaClientConstructorMock: vi.fn(),
  }),
);

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: class {
    constructor(...args: unknown[]) {
      pgAdapterConstructorMock(...args);
    }
  },
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class {
    constructor(...args: unknown[]) {
      prismaClientConstructorMock(...args);
    }
  },
}));

await import("@/lib/prisma");

// 7.12 — sem estes timeouts, uma transação presa ou um pool sem conexão livre
// contra um Postgres lento nunca solta, e o único driver usado aqui
// (@prisma/adapter-pg) não lê os parâmetros clássicos de pool_timeout/
// connection_limit de query string do Prisma.
describe("Prisma client timeouts (7.12)", () => {
  it("configures the pool's connection-acquire timeout on the pg adapter", () => {
    const options = pgAdapterConstructorMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;

    expect(options.connectionTimeoutMillis).toBe(
      env.DB_POOL_CONNECT_TIMEOUT_MS,
    );
  });

  it("configures transactionOptions.maxWait/timeout on the client", () => {
    const options = prismaClientConstructorMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    const transactionOptions = options.transactionOptions as Record<
      string,
      unknown
    >;

    expect(transactionOptions.maxWait).toBe(env.PRISMA_TX_MAX_WAIT_MS);
    expect(transactionOptions.timeout).toBe(env.PRISMA_TX_TIMEOUT_MS);
  });
});
