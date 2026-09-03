import {
  buildCatalogTaxonomy,
  buildProduct,
} from "@tests/factories/product.factory";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { clearDatabase } from "@tests/helpers/database";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { storage, storeImage } from "@/lib/storage";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import { assertDemoModeEnabled, runDemoReset } from "@/scripts/demo-reset";

afterEach(async () => {
  await clearDatabase();
  // O `UPLOAD_DIR` de teste é um diretório único deste run em `os.tmpdir()`
  // (9.10), mas dentro do run os arquivos sobrevivem entre casos — e três
  // destes testes contam arquivo. Limpar os prefixos aqui é o que os mantém
  // independentes; o `clearDatabase` continua sem responsabilidade sobre
  // filesystem, de propósito.
  for (const prefix of ["products", "pets", "brands"]) {
    await storage.deleteDirectory(prefix);
  }
});

/**
 * JPEG mínimo gerado na hora — mesmo idioma de `cleanup-uploads.test.ts` e dos
 * testes de imagem da 9.10. O que estes testes contam é arquivo, não pixel, mas
 * o buffer precisa ser imagem de verdade: `storeImage` reconhece o formato pelos
 * magic bytes e o `sharp` decodifica de fato.
 */
async function jpeg() {
  return sharp({
    create: {
      width: 30,
      height: 30,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("assertDemoModeEnabled", () => {
  it("throws when DEMO_MODE is disabled", () => {
    expect(() => assertDemoModeEnabled(false)).toThrow();
  });

  it("does not throw when DEMO_MODE is enabled", () => {
    expect(() => assertDemoModeEnabled(true)).not.toThrow();
  });
});

describe("runDemoReset", () => {
  it("wipes transactional data left over by visitors, keeping Role/Feature intact", async () => {
    const customer = await buildCustomer();
    const employee = await buildEmployee();
    await prisma.session.create({
      data: {
        userId: customer.id,
        refreshTokenHash: hashToken(generateOpaqueToken()),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.verificationToken.create({
      data: {
        userId: customer.id,
        tokenHash: hashToken(generateOpaqueToken()),
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await prisma.auditLog.create({
      data: {
        action: "USER_CREATED",
        targetType: "User",
        targetId: customer.id,
      },
    });
    await prisma.previousEmail.create({
      data: {
        userId: customer.id,
        email: `old-${customer.email}`,
        replacedAt: new Date(),
      },
    });

    const rolesBefore = await prisma.role.count();
    const featuresBefore = await prisma.feature.count();

    const result = await runDemoReset({ dryRun: false });

    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.employee.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(await prisma.verificationToken.count()).toBe(0);
    expect(await prisma.previousEmail.count()).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { targetId: customer.id } }),
    ).toBe(0);
    expect(await prisma.role.count()).toBe(rolesBefore);
    expect(await prisma.feature.count()).toBe(featuresBefore);
    expect(result.seed.rolesCount).toBe(rolesBefore);
    expect(result.seed.featuresCount).toBe(featuresBefore);
    expect(result.counts.customer).toBeGreaterThanOrEqual(1);
    expect(result.counts.employee).toBeGreaterThanOrEqual(1);
    expect(result.counts.previousEmail).toBeGreaterThanOrEqual(1);
    // SEED_FAKE_DATA/SEED_ADMIN_USER ficam desligados em teste (não sujam a
    // suíte) — guarda contra alguém ligar os dois sem querer no .env.test.
    expect(result.seed.adminUserSeeded).toBe(false);
    expect(result.seed.fakeUsersCreated).toBe(0);
    void employee;
  });

  it("does not touch anything in dry-run mode, and reports the counts that would be wiped", async () => {
    const customer = await buildCustomer();
    await prisma.previousEmail.create({
      data: {
        userId: customer.id,
        email: `old-${customer.email}`,
        replacedAt: new Date(),
      },
    });

    const result = await runDemoReset({ dryRun: true });

    expect(result.counts.customer).toBeGreaterThanOrEqual(1);
    expect(result.counts.previousEmail).toBeGreaterThanOrEqual(1);
    await expect(
      prisma.user.findUnique({ where: { id: customer.id } }),
    ).resolves.not.toBeNull();
    await expect(
      prisma.previousEmail.count({ where: { userId: customer.id } }),
    ).resolves.toBe(1);
  });

  it("records DEMO_RESET_EXECUTED in the audit log only on a real run", async () => {
    await buildCustomer();

    await runDemoReset({ dryRun: true });
    expect(
      await prisma.auditLog.count({ where: { action: "DEMO_RESET_EXECUTED" } }),
    ).toBe(0);

    await runDemoReset({ dryRun: false });
    const rows = await prisma.auditLog.findMany({
      where: { action: "DEMO_RESET_EXECUTED" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.targetType).toBe("System");
    expect(rows[0]?.actorId).toBeNull();
  });

  /**
   * O catálogo (9.6/9.7/9.10) entra no truncate a partir da 9.11 — é dado
   * transacional do demo, não referência como `Breed`. A ordem é de baixo para
   * cima porque toda FK aqui é RESTRICT: se estivesse errada, este teste
   * estouraria em erro de constraint em vez de falhar em asserção.
   */
  it("wipes the catalogue too, keeping Breed and Role intact", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);
    await prisma.productImage.create({
      data: { productId: product.id, path: "products/x/y", position: 0 },
    });

    const breedsBefore = await prisma.breed.count();

    const result = await runDemoReset({ dryRun: false });

    expect(result.counts.product).toBeGreaterThanOrEqual(1);
    expect(result.counts.productVariant).toBeGreaterThanOrEqual(1);
    expect(result.counts.productImage).toBeGreaterThanOrEqual(1);
    expect(result.counts.productCategory).toBeGreaterThanOrEqual(1);
    expect(result.counts.brand).toBeGreaterThanOrEqual(1);
    expect(result.counts.category).toBeGreaterThanOrEqual(1);

    expect(await prisma.product.count()).toBe(0);
    expect(await prisma.productVariant.count()).toBe(0);
    expect(await prisma.productImage.count()).toBe(0);
    expect(await prisma.brand.count()).toBe(0);
    expect(await prisma.category.count()).toBe(0);
    expect(await prisma.tag.count()).toBe(0);

    // Referência sobrevive, como já sobrevivia antes desta sessão.
    expect(await prisma.breed.count()).toBe(breedsBefore);
    expect(await prisma.role.count()).toBeGreaterThan(0);
  });

  /**
   * A limpeza é **por prefixo de dono** (9.11/AB5), derivada de
   * `IMAGE_DIMENSIONS` — nunca a raiz. `deleteDirectory("")` resolveria para o
   * próprio root e o `fs.rm` recursivo tentaria remover o ponto de montagem do
   * bind mount: em dev apagaria e o `put` recriaria, em produção falharia com
   * `EBUSY`.
   */
  it("clears the upload directories and reports how many files it removed", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);

    await storeImage({
      owner: "products",
      ownerId: product.id,
      buffer: await jpeg(),
    });
    await storeImage({
      owner: "brands",
      ownerId: brand.id,
      buffer: await jpeg(),
    });

    expect(await storage.countFiles("products")).toBe(2);
    expect(await storage.countFiles("brands")).toBe(2);

    const result = await runDemoReset({ dryRun: false });

    // Quatro arquivos: dois derivados por imagem gravada.
    expect(result.counts.uploadFiles).toBe(4);
    expect(await storage.countFiles("products")).toBe(0);
    expect(await storage.countFiles("brands")).toBe(0);
    expect(await storage.countFiles("pets")).toBe(0);
  }, 30_000);

  it("counts the upload files in dry-run without deleting any of them", async () => {
    const { brand } = await buildCatalogTaxonomy();

    await storeImage({
      owner: "brands",
      ownerId: brand.id,
      buffer: await jpeg(),
    });

    const result = await runDemoReset({ dryRun: true });

    expect(result.counts.uploadFiles).toBe(2);
    expect(await storage.countFiles("brands")).toBe(2);
  }, 30_000);
});
