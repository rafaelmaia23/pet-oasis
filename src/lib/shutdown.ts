type ShutdownServer = { close(callback: (err?: Error) => void): void };
type ShutdownPrisma = { $disconnect(): Promise<void> };
type ShutdownRedis = { quit(): Promise<unknown> };

type ShutdownDeps = {
  server: ShutdownServer;
  prisma: ShutdownPrisma;
  redis?: ShutdownRedis;
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: Pick<Console, "log" | "error">;
};

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Builds a signal handler that shuts the process down gracefully: stop accepting
 * new connections and drain in-flight requests (`server.close`), then release the
 * DB pool (`prisma.$disconnect`), then close the Redis connection, then exit. A
 * timeout forces exit if draining hangs, and a guard makes repeated signals
 * (SIGTERM then SIGINT) a no-op.
 *
 * Redis is optional and its failure is only logged: rate limit/lockout are
 * fail-open (D2), so a Redis that is already down must not turn every shutdown
 * into a non-zero exit.
 *
 * Dependencies are injected so the handler is unit-testable with fakes.
 */
export function createShutdownHandler({
  server,
  prisma,
  redis,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code),
  log = console,
}: ShutdownDeps): (signal: string) => Promise<void> {
  let started = false;
  let settled = false;

  const settle = (code: number) => {
    if (settled) return;
    settled = true;
    exit(code);
  };

  return async (signal: string) => {
    if (started) return;
    started = true;

    log.log(`Received ${signal}, shutting down gracefully...`);

    const forceTimer = setTimeout(() => {
      log.error(`Shutdown timed out after ${timeoutMs}ms, forcing exit.`);
      settle(1);
    }, timeoutMs);
    // Don't let the timer keep an otherwise-idle event loop alive.
    forceTimer.unref?.();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await prisma.$disconnect();

      if (redis) {
        try {
          await redis.quit();
        } catch (error) {
          log.error("Error closing the Redis connection:", error);
        }
      }

      clearTimeout(forceTimer);
      log.log("Shutdown complete.");
      settle(0);
    } catch (error) {
      clearTimeout(forceTimer);
      log.error("Error during shutdown:", error);
      settle(1);
    }
  };
}

export { DEFAULT_SHUTDOWN_TIMEOUT_MS };
