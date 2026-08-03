import { pathToFileURL } from "node:url";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Hard delete de Session/VerificationToken mortos há mais de N dias (7.13).
 * "Morto" conta a partir de QUALQUER timestamp de morte — expiresAt vencido,
 * OU usedAt, OU invalidatedAt (Session) — checado independentemente: uma
 * sessão invalidada/usada há muito tempo já é lixo mesmo que seu expiresAt
 * natural ainda esteja no futuro. Nunca roda no ciclo request/response.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const log = logger.child({ module: "cleanup-sessions" });

export async function cleanupSessions(options: {
  dryRun: boolean;
  retentionDays?: number;
}): Promise<{
  sessionsDeleted: number;
  verificationTokensDeleted: number;
  durationMs: number;
}> {
  const start = Date.now();
  const retentionDays = options.retentionDays ?? env.SESSION_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * DAY_MS);

  const sessionWhere = {
    OR: [
      { expiresAt: { lt: cutoff } },
      { usedAt: { not: null, lt: cutoff } },
      { invalidatedAt: { not: null, lt: cutoff } },
    ],
  };
  const verificationTokenWhere = {
    OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { not: null, lt: cutoff } }],
  };

  const [sessionsDeleted, verificationTokensDeleted] =
    await prisma.$transaction(async (tx) => {
      if (options.dryRun) {
        return Promise.all([
          tx.session.count({ where: sessionWhere }),
          tx.verificationToken.count({ where: verificationTokenWhere }),
        ]);
      }

      const [sessions, verificationTokens] = await Promise.all([
        tx.session.deleteMany({ where: sessionWhere }),
        tx.verificationToken.deleteMany({ where: verificationTokenWhere }),
      ]);
      return [sessions.count, verificationTokens.count];
    });

  return {
    sessionsDeleted,
    verificationTokensDeleted,
    durationMs: Date.now() - start,
  };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const dryRun = process.argv.includes("--dry-run");

  cleanupSessions({ dryRun })
    .then((result) => {
      log.info(
        result,
        dryRun ? "cleanup-sessions dry-run" : "cleanup-sessions completed",
      );
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "cleanup-sessions failed");
      process.exit(1);
    });
}
