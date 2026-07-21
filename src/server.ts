import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
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
const shutdown = createShutdownHandler({ server, prisma, redis });
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
