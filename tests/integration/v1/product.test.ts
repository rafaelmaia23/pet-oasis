import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { productViews } from "@/modules/product/product.presenter";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

/** Autoria de catálogo é `manage:product`, e `catalog-manager` a tem (9.1). */
async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

/**
 * Taxonomia mínima para pendurar um produto: o `brandId` é obrigatório e o
 * mínimo de uma categoria é regra do service (9.7/X7), então quase todo caso
 * precisa das duas.
 */
async function seedTaxonomy() {
  const brand = await prisma.brand.create({
    data: { name: "Golden", slug: "golden" },
  });
  const category = await prisma.category.create({
    data: { name: "Ração seca", slug: "racao-seca" },
  });
  const tag = await prisma.tag.create({
    data: { name: "Promoção", slug: "promocao" },
  });

  return { brand, category, tag };
}

function makeProductBody(
  brandId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    name: "Ração Golden Adulto",
    description: "Ração seca para cães adultos de porte médio.",
    brandId,
    categories: [categoryId],
    targetSpecies: ["DOG"],
    variants: [
      { sku: "GOLDEN-AD-15KG", label: "15 kg", priceCents: 24990 },
    ],
    ...overrides,
  };
}

describe("POST /api/v1/products", () => {
  it("should return 401 without a token", async () => {
    const { brand, category } = await seedTaxonomy();

    const response = await request(app)
      .post("/api/v1/products")
      .send(makeProductBody(brand.id, category.id));

    expect(response.status).toBe(401);
  });

  it("should return 403 for a customer", async () => {
    const { brand, category } = await seedTaxonomy();
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    expect(response.status).toBe(403);
  });

  it("should return 403 for a stockist — counting shelves is not authoring", async () => {
    const { brand, category } = await seedTaxonomy();
    const user = await buildEmployee({ roleNames: ["stockist"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    expect(response.status).toBe(403);
  });

  it("should create the product with its variant, categories and tags", async () => {
    const { brand, category, tag } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          tags: [tag.id],
          variants: [
            {
              sku: "GOLDEN-AD-15KG",
              label: "15 kg",
              priceCents: 24990,
              costCents: 18000,
              stockQuantity: 12,
              weightGrams: 15000,
            },
          ],
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body).toMatchView(productViews.cost);
    expect(response.body).toMatchObject({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      status: "DRAFT",
      targetSpecies: ["DOG"],
      brand: { id: brand.id },
    });
    expect(response.body.categories).toHaveLength(1);
    expect(response.body.tags).toHaveLength(1);
    expect(response.body.variants).toHaveLength(1);
    expect(response.body.variants[0]).toMatchObject({
      sku: "GOLDEN-AD-15KG",
      priceCents: 24990,
      costCents: 18000,
      stockQuantity: 12,
      isDefault: true,
    });
  });

  it("should record the creation in the audit log without the product name", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    const log = await prisma.auditLog.findFirst({
      where: { action: "PRODUCT_CREATED" },
    });

    expect(log?.targetType).toBe("Product");
    expect(log?.targetId).toBe(response.body.id);
    expect(JSON.stringify(log?.metadata)).not.toContain("Ração Golden Adulto");
  });

  it("should reject a product without variants (X3)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id, { variants: [] }));

    expect(response.status).toBe(422);
    expectValidationError(response, ["variants"]);
  });

  it("should reject a product without categories (X7)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id, { categories: [] }));

    expect(response.status).toBe(422);
    expectValidationError(response, ["categories"]);
  });

  it("should reject an unknown brand naming brandId", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();
    await prisma.brand.update({
      where: { id: brand.id },
      data: { deletedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    expect(response.status).toBe(422);
    expectValidationError(response, ["brandId"]);
  });

  it("should reject a deleted category naming categories", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();
    await prisma.category.update({
      where: { id: category.id },
      data: { deletedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    expect(response.status).toBe(422);
    expectValidationError(response, ["categories"]);
  });

  it("should reject an unknown tag naming tags", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          tags: ["11111111-1111-4111-8111-111111111111"],
        }),
      );

    expect(response.status).toBe(422);
    expectValidationError(response, ["tags"]);
  });

  it("should let an explicit slug win over the derived one (W4)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, { slug: "golden-adulto-15kg" }),
      );

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe("golden-adulto-15kg");
  });

  it("should name `name` when it produces no usable slug", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id, { name: "!!!" }));

    expect(response.status).toBe(422);
    expectValidationError(response, ["name"]);
  });

  it("should return 409 for a slug that already exists", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();
    const body = makeProductBody(brand.id, category.id);

    await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, variants: [{ ...body.variants[0], sku: "OTHER-SKU" }] });

    expect(response.status).toBe(409);
  });

  it("should reject a SKU repeated inside the same body (422, before the database)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            { sku: "SAME-SKU", label: "1 kg", priceCents: 2990 },
            { sku: "SAME-SKU", label: "15 kg", priceCents: 24990 },
          ],
        }),
      );

    expect(response.status).toBe(422);
    expectValidationError(response, ["variants"]);
  });

  it("should return 409 for a SKU held by a soft-deleted variant (X1)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();
    const body = makeProductBody(brand.id, category.id);

    const created = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

    await request(app)
      .delete(`/api/v1/products/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ ...body, slug: "outro-produto", name: "Outro produto" });

    expect(response.status).toBe(409);
  });

  it("should accept an empty targetSpecies — it means every species", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id, { targetSpecies: [] }));

    expect(response.status).toBe(201);
    expect(response.body.targetSpecies).toEqual([]);
  });

  it("should reject a species outside the enum", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, { targetSpecies: ["DRAGON"] }),
      );

    expect(response.status).toBe(422);
    expectValidationError(response, ["targetSpecies"]);
  });

  it("should reject a negative price and a negative stock (X2)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            {
              sku: "NEG",
              label: "1 kg",
              priceCents: -1,
              stockQuantity: -3,
            },
          ],
        }),
      );

    expect(response.status).toBe(422);
    expectValidationError(response);
  });

  it("should reject an unknown field (strict)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id, { featured: true }));

    expect(response.status).toBe(422);
  });

  it("should make the first variant the default when none is marked (X5)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            { sku: "A", label: "1 kg", priceCents: 2990 },
            { sku: "B", label: "15 kg", priceCents: 24990 },
          ],
        }),
      );

    expect(response.status).toBe(201);
    const defaults = response.body.variants.filter(
      (variant: { isDefault: boolean }) => variant.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].sku).toBe("A");
  });

  it("should honour the variant explicitly marked as default", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            { sku: "A", label: "1 kg", priceCents: 2990 },
            { sku: "B", label: "15 kg", priceCents: 24990, isDefault: true },
          ],
        }),
      );

    expect(response.status).toBe(201);
    const defaults = response.body.variants.filter(
      (variant: { isDefault: boolean }) => variant.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].sku).toBe("B");
  });

  it("should reject two variants marked as default (X5)", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            { sku: "A", label: "1 kg", priceCents: 2990, isDefault: true },
            { sku: "B", label: "15 kg", priceCents: 24990, isDefault: true },
          ],
        }),
      );

    expect(response.status).toBe(422);
    expectValidationError(response, ["variants"]);
  });

  it("should hide costCents from an author without read:product:cost", async () => {
    const { brand, category } = await seedTaxonomy();
    const user = await buildEmployee({
      roleNames: ["catalog-manager"],
      denies: ["read:product:cost"],
    });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(
        makeProductBody(brand.id, category.id, {
          variants: [
            {
              sku: "GOLDEN-AD-15KG",
              label: "15 kg",
              priceCents: 24990,
              costCents: 18000,
            },
          ],
        }),
      );

    expect(response.status).toBe(201);
    expect(response.body).toMatchView(productViews.internal);
    expect(JSON.stringify(response.body)).not.toContain("18000");
    expect(response.body.variants[0]).not.toHaveProperty("costCents");
  });

  it("should keep the stock quantity visible to the author", async () => {
    const { brand, category } = await seedTaxonomy();
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/products")
      .set("Authorization", `Bearer ${token}`)
      .send(makeProductBody(brand.id, category.id));

    expect(response.body.variants[0]).toHaveProperty("stockQuantity");
    expect(response.body.variants).toMatchView(
      z.array(productViews.cost.shape.variants.element),
    );
  });
});
