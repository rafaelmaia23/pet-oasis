import { pathToFileURL } from "node:url";
import { env } from "@/config/env";
import { record } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { runSeed, type SeedResult } from "@/lib/seedDatabase";
import { IMAGE_DIMENSIONS, type ImageOwner, storage } from "@/lib/storage";
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
  previousEmail: number;
  pet: number;
  employee: number;
  customer: number;
  user: number;
  productTag: number;
  productCategory: number;
  productVariant: number;
  productImage: number;
  product: number;
  brand: number;
  category: number;
  tag: number;
  /**
   * Arquivos sob os prefixos de upload. Entra no `counts` (9.11/AB14) porque a
   * partir desta sessão a operação mais destrutiva do script é a que o dry-run
   * não mostrava — e é onde alguém vai olhar quando a demo amanhecer sem foto.
   */
  uploadFiles: number;
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
/**
 * Os prefixos de upload, derivados dos donos de imagem em vez de escritos à
 * mão (9.11/AB5): um dono novo na Fase 10 (imagem de serviço, comprovante de
 * pedido) entra sozinho na limpeza, sem ninguém lembrar de vir aqui.
 *
 * Nunca a **raiz**. `storage.deleteDirectory("")` resolve para o próprio root —
 * o guard de `resolveInsideRoot` permite `resolved === this.root` — e o `fs.rm`
 * recursivo tentaria remover o ponto de montagem do bind mount (`/app/uploads`,
 * `infra/docker-compose.prod.yml`): em dev apaga e o `put` recria, em produção
 * falha com `EBUSY`. A versão "óbvia" quebraria só onde importa.
 */
const UPLOAD_PREFIXES = Object.keys(IMAGE_DIMENSIONS) as ImageOwner[];

async function countUploadFiles(): Promise<number> {
  let total = 0;

  for (const prefix of UPLOAD_PREFIXES) {
    total += await storage.countFiles(prefix);
  }

  return total;
}

async function clearUploadDirectories(): Promise<void> {
  for (const prefix of UPLOAD_PREFIXES) {
    await storage.deleteDirectory(prefix);
  }
}

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
  // toca Role/Feature/RoleFeature nem Breed (9.3), que são catálogos de
  // referência recriados/preservados pelo seed, não dado transacional do demo.
  const counts: DemoResetCounts = options.dryRun
    ? {
        auditLog: await prisma.auditLog.count(),
        userFeature: await prisma.userFeature.count(),
        userRole: await prisma.userRole.count(),
        session: await prisma.session.count(),
        verificationToken: await prisma.verificationToken.count(),
        previousEmail: await prisma.previousEmail.count(),
        pet: await prisma.pet.count(),
        employee: await prisma.employee.count(),
        customer: await prisma.customer.count(),
        user: await prisma.user.count(),
        productTag: await prisma.productTag.count(),
        productCategory: await prisma.productCategory.count(),
        productVariant: await prisma.productVariant.count(),
        productImage: await prisma.productImage.count(),
        product: await prisma.product.count(),
        brand: await prisma.brand.count(),
        category: await prisma.category.count(),
        tag: await prisma.tag.count(),
        // Leitura pura: o dry-run continua sem tocar em disco nem em banco.
        uploadFiles: await countUploadFiles(),
      }
    : await (async () => {
        // Contado **antes** do truncate: depois da limpeza o número seria zero,
        // e o que interessa registrar é quanto havia.
        const uploadFiles = await countUploadFiles();

        const dbCounts = await prisma.$transaction(async (tx) => {
          const auditLog = (await tx.auditLog.deleteMany()).count;
          const userFeature = (await tx.userFeature.deleteMany()).count;
          const userRole = (await tx.userRole.deleteMany()).count;
          const session = (await tx.session.deleteMany()).count;
          const verificationToken = (await tx.verificationToken.deleteMany())
            .count;
          const previousEmail = (await tx.previousEmail.deleteMany()).count;
          // Antes de `customer` — a FK `Pet.customerId` é RESTRICT.
          const pet = (await tx.pet.deleteMany()).count;
          const employee = (await tx.employee.deleteMany()).count;
          const customer = (await tx.customer.deleteMany()).count;
          const user = (await tx.user.deleteMany()).count;
          // Catálogo (9.6/9.7/9.10) — dado transacional do demo, não referência
          // como Breed. De baixo para cima, porque toda FK aqui é RESTRICT:
          // junções, variantes, imagens, produto e só então a taxonomia.
          // `categories` tem FK para si mesma, mas o DELETE varre a tabela
          // inteira, então nenhum pai sobra referenciado.
          const productTag = (await tx.productTag.deleteMany()).count;
          const productCategory = (await tx.productCategory.deleteMany()).count;
          const productVariant = (await tx.productVariant.deleteMany()).count;
          const productImage = (await tx.productImage.deleteMany()).count;
          const product = (await tx.product.deleteMany()).count;
          const brand = (await tx.brand.deleteMany()).count;
          const category = (await tx.category.deleteMany()).count;
          const tag = (await tx.tag.deleteMany()).count;
          return {
            auditLog,
            userFeature,
            userRole,
            session,
            verificationToken,
            previousEmail,
            pet,
            employee,
            customer,
            user,
            productTag,
            productCategory,
            productVariant,
            productImage,
            product,
            brand,
            category,
            tag,
          };
        });

        return { ...dbCounts, uploadFiles };
      })();

  // **Depois** do commit do truncate, e antes do reseed (9.11/AB15). O
  // filesystem não participa da transação do Postgres, então a ordem decide
  // qual inconsistência é possível: falhar aqui deixa banco e disco vazios
  // juntos, e o próximo reset conserta. A ordem inversa deixaria linha de
  // `ProductImage` (e `photoPath`/`logoPath`) apontando para arquivo
  // inexistente — o descasamento que o ADR de storage classifica como mais
  // grave que um órfão no disco.
  if (!options.dryRun) {
    await clearUploadDirectories();
  }

  // Dry-run nunca escreve — nem o reseed, que é upsert (idempotente, mas
  // ainda uma escrita). A prévia usa o tamanho estático dos catálogos, os
  // mesmos números que `runSeed()` devolveria.
  const seed: SeedResult = options.dryRun
    ? {
        featuresCount: DEFAULT_FEATURES.length,
        rolesCount: DEFAULT_ROLES.length,
        // 0, e não DEFAULT_BREEDS.length: o reset não trunca `breeds`, então o
        // `runSeed()` real também não criaria nenhuma.
        breedsCreated: 0,
        demoUserSeeded: false,
        adminUserSeeded: false,
        fakeUsersCreated: 0,
        fakePetsCreated: 0,
        fakeProductsCreated: 0,
        // Dry-run não roda passo nenhum, então não há passo opcional a falhar.
        failedOptionalSteps: [],
      }
    : await runSeed();
  const durationMs = Date.now() - start;

  if (!options.dryRun) {
    await record({
      action: "DEMO_RESET_EXECUTED",
      targetType: "System",
      // Os passos de demonstração que falharam entram na linha de audit (10.3):
      // é ela o registro permanente de *qual* reset deixou a demo incompleta —
      // o log de erro do seed some com a rotação, a linha não.
      metadata: {
        ...counts,
        durationMs,
        failedSeedSteps: seed.failedOptionalSteps,
      },
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
      // O seed é fail-open no dado de demonstração (10.3) — mas aqui isso não
      // pode virar sucesso silencioso. O fail-open existe para não derrubar o
      // **boot** da API; este script não é o boot: ele já truncou tudo antes de
      // resemear, então um passo que falhou deixa a demo sem aquilo até o
      // próximo timer. Sair 1 é o que faz o systemd marcar a unit como falha em
      // vez de verde.
      if (result.seed.failedOptionalSteps.length > 0) {
        log.error(result, "demo-reset finished with failed seed steps");
        process.exit(1);
      }

      log.info(result, dryRun ? "demo-reset dry-run" : "demo-reset completed");
      process.exit(0);
    })
    .catch((error: unknown) => {
      log.error({ err: error }, "demo-reset failed");
      process.exit(1);
    });
}
