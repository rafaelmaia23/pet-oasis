import { pathToFileURL } from "node:url";
import { env } from "@/config/env";
import { record } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { runSeed, type SeedResult } from "@/lib/seedDatabase";
import { DEFAULT_FEATURES } from "@/modules/feature/feature.constants";
import { DEFAULT_ROLES } from "@/modules/role/role.constants";

/**
 * Reset diário do ambiente demo (7.14): truncate + reseed, não "deletar o que
 * não é seed" — determinístico e não cresce a cada model novo. Higiene do
 * deploy de portfólio, não o que garante o demo read-only (isso é RBAC, role
 * `demo`, Fase 5) — duas defesas independentes. Nunca roda no ciclo
 * request/response.
 */

const log = logger.child({ module: "demo-reset" });

export type DemoResetCounts = {
  auditLog: number;
  userFeature: number;
  userRole: number;
  session: number;
  verificationToken: number;
  employee: number;
  customer: number;
  user: number;
};

export type DemoResetResult = {
  counts: DemoResetCounts;
  seed: SeedResult;
  durationMs: number;
};

/**
 * Guarda explícita — NUNCA inferida de NODE_ENV, porque o deploy demo *é*
 * production. Aplica tanto ao dry-run quanto à execução real: mesmo mental
 * model nos dois modos, custo zero já que o dry-run é read-only.
 */
export function assertDemoModeEnabled(demoModeEnabled: boolean): void {
  if (!demoModeEnabled) {
    throw new Error("demo-reset requires DEMO_MODE=true — refusing to run");
  }
}

export async function runDemoReset(options: {
  dryRun: boolean;
}): Promise<DemoResetResult> {
  const start = Date.now();

  // Mesma ordem FK-safe de tests/helpers/database.ts (clearDatabase) — não
  // toca Role/Feature/RoleFeature, que são referência recriada pelo seed.
  const counts: DemoResetCounts = options.dryRun
    ? {
        auditLog: await prisma.auditLog.count(),
        userFeature: await prisma.userFeature.count(),
        userRole: await prisma.userRole.count(),
        session: await prisma.session.count(),
        verificationToken: await prisma.verificationToken.count(),
        employee: await prisma.employee.count(),
        customer: await prisma.customer.count(),
        user: await prisma.user.count(),
      }
    : await prisma.$transaction(async (tx) => {
        const auditLog = (await tx.auditLog.deleteMany()).count;
        const userFeature = (await tx.userFeature.deleteMany()).count;
        const userRole = (await tx.userRole.deleteMany()).count;
        const session = (await tx.session.deleteMany()).count;
        const verificationToken = (await tx.verificationToken.deleteMany())
          .count;
        const employee = (await tx.employee.deleteMany()).count;
        const customer = (await tx.customer.deleteMany()).count;
        const user = (await tx.user.deleteMany()).count;
        return {
          auditLog,
          userFeature,
          userRole,
          session,
          verificationToken,
          employee,
          customer,
          user,
        };
      });

  // Dry-run nunca escreve — nem o reseed, que é upsert (idempotente, mas
  // ainda uma escrita). A prévia usa o tamanho estático dos catálogos, os
  // mesmos números que `runSeed()` devolveria.
  const seed: SeedResult = options.dryRun
    ? {
        featuresCount: DEFAULT_FEATURES.length,
        rolesCount: DEFAULT_ROLES.length,
        demoUserSeeded: false,
      }
    : await runSeed();
  const durationMs = Date.now() - start;

  if (!options.dryRun) {
    await record({
      action: "DEMO_RESET_EXECUTED",
      targetType: "System",
      metadata: { ...counts, durationMs },
    });
  }

  return { counts, seed, durationMs };
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    assertDemoModeEnabled(env.DEMO_MODE);
  } catch (error) {
    log.error({ err: error }, "demo-reset refused to run");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");

  runDemoReset({ dryRun })
    .then((result) => {
      log.info(result, dryRun ? "demo-reset dry-run" : "demo-reset completed");
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "demo-reset failed");
      process.exit(1);
    });
}
