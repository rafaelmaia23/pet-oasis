import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  FAKE_BRANDS,
  FAKE_CATEGORIES,
  FAKE_PRODUCTS,
  FAKE_TAGS,
} from "@/lib/seed/fakeCatalog.constants";
import { seedFakeCatalog } from "@/lib/seed/seedFakeCatalog";
import { storage } from "@/lib/storage";

afterEach(async () => {
  await clearDatabase();
});

/**
 * `withImages: false` no caso geral (9.11/AB17): uma passada completa são ~80
 * encodes de `sharp`, e o teste de idempotência chama a função duas vezes. O
 * caminho com imagem tem um `describe` próprio no fim, com `sharp` e
 * `LocalDiskStorage` reais — mockar o storage aqui esconderia justamente o
 * único risco novo, que é o seed produzir arquivo com forma diferente da que a
 * API produz.
 */
const withoutImages = { withImages: false } as const;

describe("seedFakeCatalog", () => {
  it("creates the whole taxonomy and every product on the first run", async () => {
    const result = await seedFakeCatalog(withoutImages);

    expect(result.brandsCreated).toBe(FAKE_BRANDS.length);
    expect(result.categoriesCreated).toBe(FAKE_CATEGORIES.length);
    expect(result.tagsCreated).toBe(FAKE_TAGS.length);
    expect(result.productsCreated).toBe(FAKE_PRODUCTS.length);
    expect(result.productsSkipped).toBe(0);
    expect(result.imagesStored).toBe(0);

    expect(await prisma.brand.count()).toBe(FAKE_BRANDS.length);
    expect(await prisma.category.count()).toBe(FAKE_CATEGORIES.length);
    expect(await prisma.tag.count()).toBe(FAKE_TAGS.length);
    expect(await prisma.product.count()).toBe(FAKE_PRODUCTS.length);
  });

  it("is idempotent — a second run creates nothing new", async () => {
    await seedFakeCatalog(withoutImages);
    const result = await seedFakeCatalog(withoutImages);

    expect(result.brandsCreated).toBe(0);
    expect(result.categoriesCreated).toBe(0);
    expect(result.tagsCreated).toBe(0);
    expect(result.productsCreated).toBe(0);
    expect(result.productsSkipped).toBe(FAKE_PRODUCTS.length);

    expect(await prisma.product.count()).toBe(FAKE_PRODUCTS.length);
    expect(await prisma.brand.count()).toBe(FAKE_BRANDS.length);
  });

  /**
   * O caso que a idempotência ingênua erraria: `slug` é unique **global** e o
   * índice ignora `deletedAt` (9.6/W6, 9.7/X1). Uma checagem que só olhasse
   * linha ativa não acharia o produto soft-deletado do roster e tentaria
   * recriá-lo, estourando em constraint no segundo boot do container.
   */
  it("skips the soft-deleted product on a rerun instead of colliding on the unique slug", async () => {
    await seedFakeCatalog(withoutImages);

    const softDeleted = await prisma.product.findFirstOrThrow({
      where: { slug: "tapete-higienico-sanol-carvao-ativado" },
    });

    expect(softDeleted.deletedAt).not.toBeNull();

    const result = await seedFakeCatalog(withoutImages);

    expect(result.productsCreated).toBe(0);
    expect(await prisma.product.count()).toBe(FAKE_PRODUCTS.length);
  });

  it("builds the category tree top-down, with the third level pointing at its parent", async () => {
    await seedFakeCatalog(withoutImages);

    const racaoSeca = await prisma.category.findFirstOrThrow({
      where: { slug: "racao-seca" },
      include: { parent: { include: { parent: true } } },
    });

    expect(racaoSeca.parent?.slug).toBe("racao");
    expect(racaoSeca.parent?.parent?.slug).toBe("alimentacao");
    expect(racaoSeca.parent?.parent?.parentId).toBeNull();
  });

  it("gives every variant a cost below its price, so the cost view has something to mask", async () => {
    await seedFakeCatalog(withoutImages);

    const variants = await prisma.productVariant.findMany();

    expect(variants.length).toBeGreaterThan(0);

    for (const variant of variants) {
      expect(variant.costCents).not.toBeNull();
      expect(variant.costCents ?? 0).toBeLessThan(variant.priceCents);
    }
  });

  it("promotes exactly one variant per product to default", async () => {
    await seedFakeCatalog(withoutImages);

    const products = await prisma.product.findMany({
      include: { variants: true },
    });

    for (const product of products) {
      const defaults = product.variants.filter((variant) => variant.isDefault);

      expect(defaults).toHaveLength(1);
    }
  });

  it("leaves the default variant of the partially out-of-stock product at zero", async () => {
    await seedFakeCatalog(withoutImages);

    const product = await prisma.product.findFirstOrThrow({
      where: { slug: "bola-macica-de-borracha-furacao-pet" },
      include: { variants: true },
    });

    const defaultVariant = product.variants.find(
      (variant) => variant.isDefault,
    );

    expect(defaultVariant?.stockQuantity).toBe(0);
    expect(
      product.variants.filter((variant) => variant.stockQuantity > 0).length,
    ).toBeGreaterThan(0);
  });

  it("derives the same prices on every run, because the faker is seeded by SKU", async () => {
    await seedFakeCatalog(withoutImages);
    const first = await prisma.productVariant.findMany({
      orderBy: { sku: "asc" },
      select: { sku: true, priceCents: true, stockQuantity: true },
    });

    await clearDatabase();

    await seedFakeCatalog(withoutImages);
    const second = await prisma.productVariant.findMany({
      orderBy: { sku: "asc" },
      select: { sku: true, priceCents: true, stockQuantity: true },
    });

    expect(second).toEqual(first);
  });

  describe("with images", () => {
    /**
     * `sharp` e `LocalDiskStorage` reais, sem mock: é o caminho de produção
     * inteiro. O `UPLOAD_DIR` de teste é um diretório único deste run em
     * `os.tmpdir()`, criado no `globalSetup` e apagado no teardown (9.10).
     *
     * Só um produto para não pagar os ~80 encodes do roster completo — o que se
     * prova aqui é a **forma** do arquivo, não o volume.
     */
    it("writes both WebP derivatives through the storage adapter", async () => {
      const single = FAKE_PRODUCTS.find(
        (product) => product.images.length === 1,
      );

      if (single === undefined) {
        throw new Error("o roster precisa ter um produto com uma imagem só");
      }

      const imageKey = single.images[0];

      if (imageKey === undefined) {
        throw new Error("produto de imagem única sem chave de imagem");
      }

      await seedFakeCatalog(withoutImages);

      const product = await prisma.product.findFirstOrThrow({
        where: { slug: single.slug },
      });

      // Reaproveita o caminho real de gravação sobre o produto já semeado, em
      // vez de rodar o seed inteiro com imagem.
      const { storeImage } = await import("@/lib/storage");
      const { fakeImageBuffer } = await import(
        "@/lib/seed/fakeImages.constants"
      );

      const key = await storeImage({
        owner: "products",
        ownerId: product.id,
        buffer: fakeImageBuffer(imageKey),
      });

      expect(key).toMatch(new RegExp(`^products/${product.id}/`));

      // Os dois derivados existem, e o `full` é o maior dos dois.
      expect(await storage.countFiles(`products/${product.id}`)).toBe(2);
    });

    it("stores a logo for every brand and reports the count", async () => {
      const result = await seedFakeCatalog();

      expect(result.imagesStored).toBeGreaterThanOrEqual(FAKE_BRANDS.length);

      const brands = await prisma.brand.findMany();

      for (const brand of brands) {
        expect(brand.logoPath).not.toBeNull();
        expect(await storage.countFiles(`brands/${brand.id}`)).toBe(2);
      }
    }, 60_000);
  });
});
