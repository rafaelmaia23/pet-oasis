import { describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";

const { redisConstructorMock, quitMock, onMock } = vi.hoisted(() => ({
  redisConstructorMock: vi.fn(),
  quitMock: vi.fn(async () => "OK"),
  onMock: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class {
    quit = quitMock;
    on = onMock;
    constructor(...args: unknown[]) {
      redisConstructorMock(...args);
    }
  },
}));

const { redis, disconnectRedis } = await import("@/lib/redis");

describe("Redis client", () => {
  it("connects to REDIS_URL", () => {
    expect(redisConstructorMock).toHaveBeenCalledWith(
      env.REDIS_URL,
      expect.any(Object),
    );
  });

  // Fail-open (D2): sem estas opções um Redis fora do ar enfileiraria o comando
  // e penduraria o login em vez de rejeitar na hora.
  it("fails fast instead of queueing commands while disconnected", () => {
    const options = redisConstructorMock.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;

    expect(options.enableOfflineQueue).toBe(false);
    expect(options.maxRetriesPerRequest).toBe(1);
  });

  it("registers an error listener so a Redis failure never crashes the process", () => {
    expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("closes the connection through quit()", async () => {
    await disconnectRedis();

    expect(quitMock).toHaveBeenCalledTimes(1);
    expect(redis).toBeDefined();
  });
});
