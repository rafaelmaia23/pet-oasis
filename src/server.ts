import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { createShutdownHandler } from "@/lib/shutdown";
import app from "./app";

const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});

// Graceful shutdown: Compose sends SIGTERM on stop; SIGINT covers Ctrl+C.
const shutdown = createShutdownHandler({ server, prisma });
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
