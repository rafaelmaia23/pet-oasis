import { afterEach, describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "@/lib/shutdown";

const silentLog = { log: vi.fn(), error: vi.fn() };

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
