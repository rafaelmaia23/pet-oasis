import { buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { variantViews } from "@/modules/product/product.presenter";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

/** O repositor: estoque sim, catálogo não (9.1). */
async function loginAsStockist() {
  const user = await buildEmployee({ roleNames: ["stockist"] });

  return loginAs(user.email, user.password);
}

/**
 * Produto com duas variantes, criado direto pelo Prisma: o que estes testes
 * exercitam é a rota da variante, e passar pelo `POST /products` a cada caso
 * acoplaria os dois arquivos.
 */
async function seedProduct(
  variants: { sku: string; label: string; isDefault?: boolean }[] = [
    { sku: "A", label: "1 kg", isDefault: true },
    { sku: "B", label: "15 kg" },
  ],
) {
  const brand = await prisma.brand.create({
    data: { name: "Golden", slug: "golden" },
  });
  const category = await prisma.category.create({
    data: { name: "Ração seca", slug: "racao-seca" },
  });

  return prisma.product.create({
    data: {
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      description: "Ração seca para cães adultos.",
      brandId: brand.id,
      targetSpecies: ["DOG"],
      categories: { create: { categoryId: category.id } },
      variants: {
        create: variants.map((variant) => ({
          ...variant,
          priceCents: 24990,
          stockQuantity: 10,
          costCents: 18000,
        })),
      },
    },
    include: { variants: { orderBy: { sku: "asc" } } },
  });
}

describe("POST /api/v1/products/:productId/variants", () => {
  it("should return 403 for a stockist — adding a SKU is authoring", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sku: "C", label: "3 kg", priceCents: 8990 });

    expect(response.status).toBe(403);
  });

  it("should create the variant", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sku: "C", label: "3 kg", priceCents: 8990, stockQuantity: 4 });

    expect(response.status).toBe(201);
    expect(response.body).toMatchView(variantViews.cost);
    expect(response.body).toMatchObject({
      sku: "C",
      label: "3 kg",
      priceCents: 8990,
      stockQuantity: 4,
      isDefault: false,
    });
  });

  it("should return 404 for an unknown product", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post(
        "/api/v1/products/11111111-1111-4111-8111-111111111111/variants",
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ sku: "C", label: "3 kg", priceCents: 8990 });

    expect(response.status).toBe(404);
  });

  it("should return 409 for a SKU already in use", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set("Authorization", `Bearer ${token}`)
      .send({ sku: "A", label: "outra", priceCents: 8990 });

    expect(response.status).toBe(409);
  });

  it("should demote the previous default when the new variant claims it (X5)", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/variants`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        sku: "C",
        label: "3 kg",
        priceCents: 8990,
        isDefault: true,
      });

    expect(response.status).toBe(201);

    const defaults = await prisma.productVariant.findMany({
      where: { productId: product.id, isDefault: true, deletedAt: null },
    });

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.sku).toBe("C");
  });
});

describe("PATCH /api/v1/variants/:variantId", () => {
  it("should let a stockist adjust the stock alone (X4)", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7 });

    expect(response.status).toBe(200);
    expect(response.body.stockQuantity).toBe(7);
    // Sem `read:product:cost`, o repositor recebe a view sem custo.
    expect(response.body).not.toHaveProperty("costCents");
  });

  it("should return 403 when the stockist also sends a catalog field (X4)", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7, priceCents: 19990 });

    expect(response.status).toBe(403);

    const untouched = await prisma.productVariant.findUnique({
      where: { id: product.variants[0]?.id ?? "" },
    });
    expect(untouched?.stockQuantity).toBe(10);
  });

  it("should return 403 when an author without manage:stock sends the stock (X4)", async () => {
    const product = await seedProduct();
    const user = await buildEmployee({
      roleNames: ["catalog-manager"],
      denies: ["manage:stock"],
    });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7 });

    expect(response.status).toBe(403);
  });

  it("should accept a mixed body from someone holding both features", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7, priceCents: 19990 });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      stockQuantity: 7,
      priceCents: 19990,
    });
  });

  it("should record the stock adjustment as its own action, with from and to", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7 });

    const log = await prisma.auditLog.findFirst({
      where: { action: "PRODUCT_STOCK_ADJUSTED" },
    });

    expect(log?.targetType).toBe("ProductVariant");
    expect(log?.metadata).toMatchObject({ from: 10, to: 7 });
  });

  it("should record both actions for a mixed body", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: 7, priceCents: 19990 });

    const actions = await prisma.auditLog.findMany({
      where: {
        action: { in: ["PRODUCT_STOCK_ADJUSTED", "PRODUCT_VARIANT_UPDATED"] },
      },
    });

    expect(actions).toHaveLength(2);
  });

  it("should reject a negative stock (X2)", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ stockQuantity: -1 });

    expect(response.status).toBe(422);
    expectValidationError(response, ["stockQuantity"]);
  });

  it("should reject an empty body", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);
  });

  it("should promote the variant asked for and demote the previous default (X5)", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[1]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isDefault: true });

    expect(response.status).toBe(200);

    const defaults = await prisma.productVariant.findMany({
      where: { productId: product.id, isDefault: true, deletedAt: null },
    });

    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.sku).toBe("B");
  });

  it("should refuse to demote the default without electing another (X5)", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isDefault: false });

    expect(response.status).toBe(422);
    expectValidationError(response, ["isDefault"]);
  });

  it("should return 404 for an unknown variant", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch("/api/v1/variants/11111111-1111-4111-8111-111111111111")
      .set("Authorization", `Bearer ${token}`)
      .send({ priceCents: 100 });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/variants/:variantId", () => {
  it("should return 409 when it is the last active variant (X6)", async () => {
    const product = await seedProduct([
      { sku: "ONLY", label: "único", isDefault: true },
    ]);
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .delete(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it("should soft delete the variant and promote another when it was the default (X5)", async () => {
    const product = await seedProduct();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .delete(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const remaining = await prisma.productVariant.findMany({
      where: { productId: product.id, deletedAt: null },
    });

    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.sku).toBe("B");
    expect(remaining[0]?.isDefault).toBe(true);
  });

  it("should return 403 for a stockist", async () => {
    const product = await seedProduct();
    const token = await loginAsStockist();

    const response = await request(app)
      .delete(`/api/v1/variants/${product.variants[0]?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 401 without a token", async () => {
    const product = await seedProduct();

    const response = await request(app).delete(
      `/api/v1/variants/${product.variants[0]?.id}`,
    );

    expect(response.status).toBe(401);
  });
});
