import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "@/lib/shutdown";

const silentLog = { info: vi.fn(), error: vi.fn() };

type CloseCb = (err?: Error) => void;

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("createShutdownHandler()", () => {
  it("closes the server, then disconnects prisma, then exits 0", async () => {
    const order: string[] = [];
    const server = {
      close: vi.fn((cb: CloseCb) => {
        order.push("close");
        cb();
      }),
    };
    const prisma = {
      $disconnect: vi.fn(async () => {
        order.push("disconnect");
      }),
    };
    const exit = vi.fn();

    await createShutdownHandler({ server, prisma, exit, log: silentLog })(
      "SIGTERM",
    );

    expect(order).toEqual(["close", "disconnect"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("exits 1 (without disconnecting) when server.close fails", async () => {
    const server = {
      close: vi.fn((cb: CloseCb) => cb(new Error("close failed"))),
    };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const exit = vi.fn();

    await createShutdownHandler({ server, prisma, exit, log: silentLog })(
      "SIGTERM",
    );

    expect(prisma.$disconnect).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("exits 1 when prisma.$disconnect fails", async () => {
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = {
      $disconnect: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const exit = vi.fn();

    await createShutdownHandler({ server, prisma, exit, log: silentLog })(
      "SIGTERM",
    );

    expect(exit).toHaveBeenCalledWith(1);
  });

  it("ignores a second signal while already shutting down", async () => {
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const exit = vi.fn();
    const handler = createShutdownHandler({
      server,
      prisma,
      exit,
      log: silentLog,
    });

    await Promise.all([handler("SIGTERM"), handler("SIGINT")]);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("closes redis after prisma, then exits 0", async () => {
    const order: string[] = [];
    const server = {
      close: vi.fn((cb: CloseCb) => {
        order.push("close");
        cb();
      }),
    };
    const prisma = {
      $disconnect: vi.fn(async () => {
        order.push("disconnect");
      }),
    };
    const redis = {
      quit: vi.fn(async () => {
        order.push("quit");
        return "OK";
      }),
    };
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      redis,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(order).toEqual(["close", "disconnect", "quit"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  // Fail-open (D2): um Redis já fora do ar não deve fazer todo shutdown sair 1.
  it("still exits 0 when redis.quit fails", async () => {
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const redis = { quit: vi.fn().mockRejectedValue(new Error("redis down")) };
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      redis,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(exit).toHaveBeenCalledWith(0);
  });

  // 7.11 — Sentry/Axiom drenados no shutdown normal, best-effort.
  it("closes sentry and flushes the logger after a successful shutdown", async () => {
    const order: string[] = [];
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const sentry = {
      close: vi.fn(async () => {
        order.push("sentry.close");
        return true;
      }),
    };
    const flushLogger = vi.fn(async () => {
      order.push("flushLogger");
    });
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      sentry,
      flushLogger,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(order).toEqual(["sentry.close", "flushLogger"]);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("still exits 0 when sentry.close() rejects (fail-open for the external dep)", async () => {
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const sentry = {
      close: vi.fn().mockRejectedValue(new Error("sentry down")),
    };
    const flushLogger = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      sentry,
      flushLogger,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(flushLogger).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("still exits 0 when flushLogger() rejects", async () => {
    const server = { close: vi.fn((cb: CloseCb) => cb()) };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const flushLogger = vi.fn().mockRejectedValue(new Error("flush failed"));
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      flushLogger,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(exit).toHaveBeenCalledWith(0);
  });

  it("also drains sentry/flushLogger on the error path (before settle(1))", async () => {
    const server = {
      close: vi.fn((cb: CloseCb) => cb(new Error("close failed"))),
    };
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const sentry = { close: vi.fn().mockResolvedValue(true) };
    const flushLogger = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    await createShutdownHandler({
      server,
      prisma,
      sentry,
      flushLogger,
      exit,
      log: silentLog,
    })("SIGTERM");

    expect(sentry.close).toHaveBeenCalledTimes(1);
    expect(flushLogger).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("does not call sentry/flushLogger on the forced-timeout path", async () => {
    vi.useFakeTimers();
    const server = { close: vi.fn() }; // never invokes the callback
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const sentry = { close: vi.fn().mockResolvedValue(true) };
    const flushLogger = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    void createShutdownHandler({
      server,
      prisma,
      sentry,
      flushLogger,
      timeoutMs: 5000,
      exit,
      log: silentLog,
    })("SIGTERM");

    await vi.advanceTimersByTimeAsync(5000);

    expect(sentry.close).not.toHaveBeenCalled();
    expect(flushLogger).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("forces exit(1) when shutdown exceeds the timeout", async () => {
    vi.useFakeTimers();
    const server = { close: vi.fn() }; // never invokes the callback
    const prisma = { $disconnect: vi.fn().mockResolvedValue(undefined) };
    const exit = vi.fn();

    void createShutdownHandler({
      server,
      prisma,
      timeoutMs: 5000,
      exit,
      log: silentLog,
    })("SIGTERM");

    await vi.advanceTimersByTimeAsync(5000);

    expect(exit).toHaveBeenCalledWith(1);
  });
});
