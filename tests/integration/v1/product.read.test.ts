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
import {
  productListViews,
  productViews,
} from "@/modules/product/product.presenter";

/**
 * Leitura do catálogo (9.8) — a **vitrine**. Arquivo próprio porque
 * `product.test.ts` já é a escrita: o que se prova aqui não é o que entra no
 * banco, é o que sai dele e para quem.
 *
 * Três eixos: a view muda com a capability do ator (Y9/Y10), o conjunto visível
 * muda com `read:product:internal` (Y1/Y8) e os filtros compõem sem escapar
 * desse recorte.
 */

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

type VariantSeed = {
  sku: string;
  label?: string;
  priceCents: number;
  stockQuantity?: number;
  costCents?: number;
  isDefault?: boolean;
};

type ProductSeed = {
  name: string;
  slug: string;
  status?: "DRAFT" | "ACTIVE" | "DISCONTINUED";
  targetSpecies?: ("DOG" | "CAT" | "BIRD")[];
  brandId: string;
  categoryIds: string[];
  tagIds?: string[];
  variants: VariantSeed[];
};

/**
 * Escreve pelo Prisma, não pela rota: o estado da vitrine é *fixture*, e passar
 * por `POST /products` em cada caso amarraria o teste de leitura às regras de
 * escrita da 9.7 — que já têm arquivo próprio.
 */
async function seedProduct(seed: ProductSeed) {
  return prisma.product.create({
    data: {
      name: seed.name,
      slug: seed.slug,
      description: `Descrição de ${seed.name}`,
      brandId: seed.brandId,
      status: seed.status ?? "ACTIVE",
      targetSpecies: seed.targetSpecies ?? [],
      categories: {
        create: seed.categoryIds.map((categoryId) => ({ categoryId })),
      },
      tags: { create: (seed.tagIds ?? []).map((tagId) => ({ tagId })) },
      variants: {
        create: seed.variants.map((variant, index) => ({
          sku: variant.sku,
          label: variant.label ?? variant.sku,
          priceCents: variant.priceCents,
          stockQuantity: variant.stockQuantity ?? 10,
          ...(variant.costCents === undefined
            ? {}
            : { costCents: variant.costCents }),
          isDefault: variant.isDefault ?? index === 0,
        })),
      },
    },
  });
}

/**
 * Taxonomia base: uma marca, a árvore `alimentacao > racao > racao-seca` (três
 * níveis, o teto do W1) e duas tags. A árvore existe porque `?category=` tem
 * que descer a subárvore (W2), e provar isso exige um neto.
 */
async function seedTaxonomy() {
  const brand = await prisma.brand.create({
    data: { name: "Golden", slug: "golden" },
  });
  const otherBrand = await prisma.brand.create({
    data: { name: "Whiskas", slug: "whiskas" },
  });

  const alimentacao = await prisma.category.create({
    data: { name: "Alimentação", slug: "alimentacao" },
  });
  const racao = await prisma.category.create({
    data: { name: "Ração", slug: "racao", parentId: alimentacao.id },
  });
  const racaoSeca = await prisma.category.create({
    data: { name: "Ração seca", slug: "racao-seca", parentId: racao.id },
  });
  const higiene = await prisma.category.create({
    data: { name: "Higiene", slug: "higiene" },
  });

  const promocao = await prisma.tag.create({
    data: { name: "Promoção", slug: "promocao" },
  });
  const filhote = await prisma.tag.create({
    data: { name: "Filhote", slug: "filhote" },
  });

  return {
    brand,
    otherBrand,
    alimentacao,
    racao,
    racaoSeca,
    higiene,
    promocao,
    filhote,
  };
}

const loginAsCustomer = async () => {
  const user = await buildCustomer();
  return loginAs(user.email, user.password);
};

/** Vê o estoque exato e os rascunhos, não vê custo (9.1). */
const loginAsAttendant = async () => {
  const user = await buildEmployee({ roleNames: ["attendant"] });
  return loginAs(user.email, user.password);
};

/** Vê tudo: custo, estoque e rascunho. */
const loginAsCatalogManager = async () => {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });
  return loginAs(user.email, user.password);
};

describe("GET /api/v1/products — views por capability", () => {
  it("should answer an anonymous visitor with the public view", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 24990, costCents: 15000 }],
    });

    const response = await request(app).get("/api/v1/products");

    // Sem token e sem 401: é a vitrine (N15).
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(productListViews.public));
  });

  it("should not leak costCents or stockQuantity to the public — the contract test", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 24990, costCents: 15000 }],
    });

    const response = await request(app).get("/api/v1/products");
    const [product] = response.body.data;

    expect(product).not.toHaveProperty("status");
    expect(product.variants[0]).not.toHaveProperty("costCents");
    expect(product.variants[0]).not.toHaveProperty("stockQuantity");
    expect(product.variants[0]).toHaveProperty("inStock", true);
  });

  it("should give a logged-in customer the same public view", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 24990, costCents: 15000 }],
    });
    const token = await loginAsCustomer();

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(productListViews.public));
  });

  it("should give an attendant the exact stock and no cost", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "A", priceCents: 24990, costCents: 15000, stockQuantity: 7 },
      ],
    });
    const token = await loginAsAttendant();

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(productListViews.internal));
    expect(response.body.data[0].variants[0].stockQuantity).toBe(7);
  });

  it("should give a catalog manager the cost view", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 24990, costCents: 15000 }],
    });
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(productListViews.cost));
    expect(response.body.data[0].variants[0].costCents).toBe(15000);
  });

  it("should let read:product:cost alone unlock the internal side too (Y9)", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Rascunho",
      slug: "rascunho",
      status: "DRAFT",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 1000, costCents: 500 }],
    });

    // Custo sem a visão interna só existe por override — e a decisão Y9 é que
    // quem vê margem vê o resto: separar os dois daria uma quarta view para
    // sustentar um cargo que não existe.
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:product:internal"],
      grants: ["read:product:cost"],
    });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data).toMatchView(z.array(productListViews.cost));
  });

  it("should fall back to the public view when both features are denied", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Rascunho",
      slug: "rascunho",
      status: "DRAFT",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 1000, costCents: 500 }],
    });

    // O contraste do caso acima: mesmo cargo, mesmo fixture, só que sem o
    // grant. Sem ele o rascunho some — que é o que prova que o `deny` de
    // `read:product:internal` pegou, e não que o atendente veria tudo de todo
    // jeito.
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:product:internal"],
    });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(0);
  });

  it("should return 200 with a malformed token instead of 401", async () => {
    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", "Bearer nao-e-um-token");

    // O que distingue `optionalAuthenticate` do `authenticate`: leitura de
    // catálogo nunca devolve 401.
    expect(response.status).toBe(200);
  });
});

describe("GET /api/v1/products — visibilidade por status", () => {
  async function seedThreeStatuses() {
    const taxonomy = await seedTaxonomy();

    await seedProduct({
      name: "Ativo",
      slug: "ativo",
      status: "ACTIVE",
      brandId: taxonomy.brand.id,
      categoryIds: [taxonomy.racaoSeca.id],
      variants: [{ sku: "ATIVO", priceCents: 1000 }],
    });
    await seedProduct({
      name: "Rascunho",
      slug: "rascunho",
      status: "DRAFT",
      brandId: taxonomy.brand.id,
      categoryIds: [taxonomy.racaoSeca.id],
      variants: [{ sku: "RASCUNHO", priceCents: 2000 }],
    });
    await seedProduct({
      name: "Descontinuado",
      slug: "descontinuado",
      status: "DISCONTINUED",
      brandId: taxonomy.brand.id,
      categoryIds: [taxonomy.racaoSeca.id],
      variants: [{ sku: "DESC", priceCents: 3000 }],
    });

    return taxonomy;
  }

  it("should show only ACTIVE products to the public", async () => {
    await seedThreeStatuses();

    const response = await request(app).get("/api/v1/products");

    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0].slug).toBe("ativo");
  });

  it("should show every status to staff", async () => {
    await seedThreeStatuses();
    const token = await loginAsAttendant();

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.meta.total).toBe(3);
  });

  it("should silently ignore ?status= from the public (Y1)", async () => {
    await seedThreeStatuses();

    const response = await request(app).get("/api/v1/products?status=DRAFT");

    // Nem 422 nem 403: a vitrine não confirma que rascunho existe, e o erro
    // seria justamente a confirmação.
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("ativo");
  });

  it("should honour ?status= for staff", async () => {
    await seedThreeStatuses();
    const token = await loginAsAttendant();

    const response = await request(app)
      .get("/api/v1/products?status=DRAFT")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("rascunho");
  });

  it("should never show a soft-deleted product, not even to staff", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    const product = await seedProduct({
      name: "Excluído",
      slug: "excluido",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "EXC", priceCents: 1000 }],
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .get("/api/v1/products")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.meta.total).toBe(0);
  });
});

describe("GET /api/v1/products — filtros", () => {
  it("should match a species and also the products marked for any species (Y5)", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Ração de cão",
      slug: "racao-cao",
      targetSpecies: ["DOG"],
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "CAO", priceCents: 1000 }],
    });
    await seedProduct({
      name: "Comedouro universal",
      slug: "comedouro",
      targetSpecies: [],
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "COM", priceCents: 2000 }],
    });
    await seedProduct({
      name: "Ração de gato",
      slug: "racao-gato",
      targetSpecies: ["CAT"],
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "GATO", priceCents: 3000 }],
    });

    const response = await request(app).get("/api/v1/products?species=DOG");

    // `targetSpecies: []` significa "qualquer espécie" (N7): o comedouro não
    // pode sumir da seção de cães só por não estar marcado.
    expect(
      response.body.data.map((item: { slug: string }) => item.slug).sort(),
    ).toEqual(["comedouro", "racao-cao"]);
  });

  it("should bring the products of a category's descendants (W2)", async () => {
    const { brand, alimentacao, racaoSeca, higiene } = await seedTaxonomy();
    await seedProduct({
      name: "Neta",
      slug: "neta",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "NETA", priceCents: 1000 }],
    });
    await seedProduct({
      name: "No próprio nó",
      slug: "no-no",
      brandId: brand.id,
      categoryIds: [alimentacao.id],
      variants: [{ sku: "NO", priceCents: 2000 }],
    });
    await seedProduct({
      name: "Outro ramo",
      slug: "outro-ramo",
      brandId: brand.id,
      categoryIds: [higiene.id],
      variants: [{ sku: "OUTRO", priceCents: 3000 }],
    });

    const response = await request(app).get(
      "/api/v1/products?category=alimentacao",
    );

    // Produto vincula a qualquer nó, folha ou não: "produtos de alimentação" é
    // o nó **mais** a subárvore, senão metade da vitrine fica invisível.
    expect(
      response.body.data.map((item: { slug: string }) => item.slug).sort(),
    ).toEqual(["neta", "no-no"]);
  });

  it("should intersect repeated ?tag= (Y6)", async () => {
    const { brand, racaoSeca, promocao, filhote } = await seedTaxonomy();
    await seedProduct({
      name: "As duas",
      slug: "as-duas",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      tagIds: [promocao.id, filhote.id],
      variants: [{ sku: "DUAS", priceCents: 1000 }],
    });
    await seedProduct({
      name: "Só promoção",
      slug: "so-promocao",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      tagIds: [promocao.id],
      variants: [{ sku: "UMA", priceCents: 2000 }],
    });

    const response = await request(app).get(
      "/api/v1/products?tag=promocao&tag=filhote",
    );

    // Cada faceta marcada **estreita** a lista, como em qualquer e-commerce.
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("as-duas");
  });

  it("should filter by brand slug", async () => {
    const { brand, otherBrand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Da Golden",
      slug: "da-golden",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "G", priceCents: 1000 }],
    });
    await seedProduct({
      name: "Da Whiskas",
      slug: "da-whiskas",
      brandId: otherBrand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "W", priceCents: 2000 }],
    });

    const response = await request(app).get("/api/v1/products?brand=golden");

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("da-golden");
  });

  it("should let a non-default variant pull the product into the price range", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Duas variantes",
      slug: "duas-variantes",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "PEQ", priceCents: 1000, isDefault: true },
        { sku: "GRA", priceCents: 90000 },
      ],
    });

    const response = await request(app).get(
      "/api/v1/products?minPrice=80000&maxPrice=100000",
    );

    // Contraintuitivo e documentado: a faixa olha **as variantes**, e o produto
    // entra se alguma delas couber — mesmo que a default esteja longe da faixa.
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("duas-variantes");
  });

  it("should filter by availability in both directions", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Com estoque",
      slug: "com-estoque",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "COM", priceCents: 1000, stockQuantity: 3 }],
    });
    await seedProduct({
      name: "Esgotado",
      slug: "esgotado",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "SEM", priceCents: 2000, stockQuantity: 0 }],
    });

    const inStock = await request(app).get("/api/v1/products?inStock=true");
    const outOfStock = await request(app).get("/api/v1/products?inStock=false");

    expect(inStock.body.data.map((i: { slug: string }) => i.slug)).toEqual([
      "com-estoque",
    ]);
    expect(outOfStock.body.data.map((i: { slug: string }) => i.slug)).toEqual([
      "esgotado",
    ]);
  });

  it("should return an empty list for a taxonomy slug that does not exist", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Único",
      slug: "unico",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "U", priceCents: 1000 }],
    });

    const response = await request(app).get(
      "/api/v1/products?category=nao-existe",
    );

    // Filtro, não resolução de recurso (V2): a listagem não vira oráculo de
    // existência de categoria.
    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(0);
  });

  it("should combine filters", async () => {
    const { brand, otherBrand, racao, racaoSeca, promocao } =
      await seedTaxonomy();
    await seedProduct({
      name: "Alvo",
      slug: "alvo",
      targetSpecies: ["DOG"],
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      tagIds: [promocao.id],
      variants: [{ sku: "ALVO", priceCents: 5000, stockQuantity: 4 }],
    });
    await seedProduct({
      name: "Marca errada",
      slug: "marca-errada",
      targetSpecies: ["DOG"],
      brandId: otherBrand.id,
      categoryIds: [racaoSeca.id],
      tagIds: [promocao.id],
      variants: [{ sku: "ERR", priceCents: 5000, stockQuantity: 4 }],
    });
    await seedProduct({
      name: "Sem estoque",
      slug: "sem-estoque",
      targetSpecies: ["DOG"],
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      tagIds: [promocao.id],
      variants: [{ sku: "SEM", priceCents: 5000, stockQuantity: 0 }],
    });

    const response = await request(app).get(
      `/api/v1/products?species=DOG&category=${racao.slug}&tag=promocao&brand=golden&minPrice=1000&maxPrice=9000&inStock=true`,
    );

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("alvo");
  });
});

describe("GET /api/v1/products — paginação e ordenação", () => {
  it("should sort by the lowest active variant price (Y3)", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Caro por default",
      slug: "caro-por-default",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "CARO-D", priceCents: 90000, isDefault: true },
        { sku: "CARO-B", priceCents: 500 },
      ],
    });
    await seedProduct({
      name: "Meio",
      slug: "meio",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "MEIO", priceCents: 1000 }],
    });

    const response = await request(app).get(
      "/api/v1/products?sort=price&order=asc",
    );

    // O produto vale o **menor** preço entre as variantes ativas — o "a partir
    // de R$ X" da vitrine —, não o preço da variante default.
    expect(response.body.data.map((i: { slug: string }) => i.slug)).toEqual([
      "caro-por-default",
      "meio",
    ]);
  });

  it("should ignore a soft-deleted variant when ranking by price", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    const cheapDeleted = await seedProduct({
      name: "Barata morta",
      slug: "barata-morta",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "VIVA", priceCents: 8000, isDefault: true },
        { sku: "MORTA", priceCents: 100 },
      ],
    });
    await prisma.productVariant.updateMany({
      where: { productId: cheapDeleted.id, sku: "MORTA" },
      data: { deletedAt: new Date() },
    });
    await seedProduct({
      name: "Barata viva",
      slug: "barata-viva",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "BV", priceCents: 5000 }],
    });

    const response = await request(app).get("/api/v1/products?sort=price");

    expect(response.body.data.map((i: { slug: string }) => i.slug)).toEqual([
      "barata-viva",
      "barata-morta",
    ]);
  });

  it("should not repeat or skip products with the same price across pages", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();

    for (let index = 0; index < 6; index += 1) {
      await seedProduct({
        name: `Empatado ${index}`,
        slug: `empatado-${index}`,
        brandId: brand.id,
        categoryIds: [racaoSeca.id],
        variants: [{ sku: `EMP-${index}`, priceCents: 1000 }],
      });
    }

    const first = await request(app).get(
      "/api/v1/products?sort=price&limit=3&page=1",
    );
    const second = await request(app).get(
      "/api/v1/products?sort=price&limit=3&page=2",
    );

    const slugs = [...first.body.data, ...second.body.data].map(
      (item: { slug: string }) => item.slug,
    );

    // O tiebreaker por id é o que impede o deslize na borda da página — a lição
    // da 7.7, que vale para o offset também.
    expect(new Set(slugs).size).toBe(6);
    expect(first.body.meta.total).toBe(6);
  });

  it("should sort by name", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Zeta",
      slug: "zeta",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "Z", priceCents: 1000 }],
    });
    await seedProduct({
      name: "Alfa",
      slug: "alfa",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 2000 }],
    });

    const response = await request(app).get("/api/v1/products?sort=name");

    expect(response.body.data.map((i: { slug: string }) => i.slug)).toEqual([
      "alfa",
      "zeta",
    ]);
  });

  it("should return 422 for a sort field outside the allowlist", async () => {
    const response = await request(app).get("/api/v1/products?sort=costCents");

    // O campo nunca vai cru para o `orderBy`: fora da allowlist morre no
    // controller. Note que `costCents` é justamente o que não pode vazar nem
    // como critério de ordenação.
    expect(response.status).toBe(422);
    expectValidationError(response, ["sort"]);
  });

  it("should return 422 for ?order= without ?sort=", async () => {
    const response = await request(app).get("/api/v1/products?order=asc");

    expect(response.status).toBe(422);
    expectValidationError(response, ["order"]);
  });

  it("should paginate with a coherent envelope", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();

    for (let index = 0; index < 5; index += 1) {
      await seedProduct({
        name: `Produto ${index}`,
        slug: `produto-${index}`,
        brandId: brand.id,
        categoryIds: [racaoSeca.id],
        variants: [{ sku: `P-${index}`, priceCents: 1000 + index }],
      });
    }

    const response = await request(app).get("/api/v1/products?page=2&limit=2");

    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toEqual({ page: 2, limit: 2, total: 5 });
  });
});

describe("GET /api/v1/products/:idOrSlug", () => {
  it("should resolve by id and by slug into the same body (Y2)", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    const product = await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "A", priceCents: 24990 }],
    });

    const byId = await request(app).get(`/api/v1/products/${product.id}`);
    const bySlug = await request(app).get(
      "/api/v1/products/racao-golden-adulto",
    );

    expect(byId.status).toBe(200);
    expect(bySlug.status).toBe(200);
    expect(byId.body).toEqual(bySlug.body);
    expect(byId.body).toMatchView(productViews.public);
  });

  it("should list the variants with the default first", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Duas variantes",
      slug: "duas-variantes",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "SEGUNDA", priceCents: 1000, isDefault: false },
        { sku: "PRIMEIRA", priceCents: 2000, isDefault: true },
      ],
    });

    const response = await request(app).get("/api/v1/products/duas-variantes");

    expect(
      response.body.variants.map((item: { sku: string }) => item.sku),
    ).toEqual(["PRIMEIRA", "SEGUNDA"]);
  });

  it("should return 404 for a draft asked by its exact slug (Y8)", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Rascunho",
      slug: "rascunho",
      status: "DRAFT",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "R", priceCents: 1000 }],
    });

    const response = await request(app).get("/api/v1/products/rascunho");

    // Não 403: a rota é pública e não tem gate de autorização, então o rascunho
    // simplesmente não está no conjunto visível. Um 403 confirmaria o slug.
    expect(response.status).toBe(404);
  });

  it("should show that same draft to staff", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    await seedProduct({
      name: "Rascunho",
      slug: "rascunho",
      status: "DRAFT",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "R", priceCents: 1000 }],
    });
    const token = await loginAsAttendant();

    const response = await request(app)
      .get("/api/v1/products/rascunho")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchView(productViews.internal);
  });

  it("should return 404 for an unknown slug and for an unknown uuid alike", async () => {
    const bySlug = await request(app).get("/api/v1/products/nao-existe");
    const byId = await request(app).get(
      "/api/v1/products/3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    );

    expect(bySlug.status).toBe(404);
    expect(byId.status).toBe(404);
  });

  it("should return 404 for a soft-deleted product", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    const product = await seedProduct({
      name: "Excluído",
      slug: "excluido",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [{ sku: "E", priceCents: 1000 }],
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .get("/api/v1/products/excluido")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should hide a soft-deleted variant from the detail", async () => {
    const { brand, racaoSeca } = await seedTaxonomy();
    const product = await seedProduct({
      name: "Com variante morta",
      slug: "com-variante-morta",
      brandId: brand.id,
      categoryIds: [racaoSeca.id],
      variants: [
        { sku: "VIVA", priceCents: 1000, isDefault: true },
        { sku: "MORTA", priceCents: 2000 },
      ],
    });
    await prisma.productVariant.updateMany({
      where: { productId: product.id, sku: "MORTA" },
      data: { deletedAt: new Date() },
    });

    const response = await request(app).get(
      "/api/v1/products/com-variante-morta",
    );

    expect(
      response.body.variants.map((item: { sku: string }) => item.sku),
    ).toEqual(["VIVA"]);
  });
});
