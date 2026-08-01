import { env } from "@/config/env";
import { flushLogger, logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
// `Sentry.init()` (7.11) roda como efeito colateral deste import. Não
// precisa vir literalmente primeiro no arquivo: o projeto só usa captura
// manual de exceção (sem a instrumentação automática de HTTP/Express que
// exigiria isso), e `error-handler.middleware.ts` já importa este módulo
// transitivamente antes de qualquer request ser processado.
import { Sentry } from "@/lib/sentry";
import { createShutdownHandler } from "@/lib/shutdown";
import app from "./app";

const log = logger.child({ module: "lifecycle" });

const server = app.listen(env.PORT, () => {
  log.info(
    { port: env.PORT, nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL },
    "server started",
  );
});

// Graceful shutdown: Compose sends SIGTERM on stop; SIGINT covers Ctrl+C.
const shutdown = createShutdownHandler({
  server,
  prisma,
  redis,
  sentry: Sentry,
  flushLogger,
});
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// 7.11 — falha de verdade que escapou de tudo: captura no Sentry e reusa o
// mesmo caminho de shutdown gracioso (o guard `started` do handler já cobre
// a corrida com um SIGTERM/SIGINT concorrente).
process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "unhandled rejection");
  Sentry.captureException(reason);
  void shutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  log.error({ err }, "uncaught exception");
  Sentry.captureException(err);
  void shutdown("uncaughtException");
});
