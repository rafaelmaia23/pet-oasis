import { buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import { refreshSearchDictionary } from "@tests/helpers/search";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "@/app";
import { prisma } from "@/lib/prisma";

/**
 * Busca textual do catálogo (9.9). Arquivo próprio porque o que se prova aqui
 * não é o recorte da vitrine (isso é `product.read.test.ts`), é a **qualidade
 * do casamento**: acento, radical, erro de digitação e ordem por relevância.
 *
 * Toda asserção é de comportamento observável — "buscar `golen` acha a Golden"
 * —, nunca da forma da query. É a armadilha que o ADR `docs/adr/0009-text-search.md`
 * aponta como a maior desta sub-fase.
 */

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

async function seedTaxonomy() {
  const golden = await prisma.brand.create({
    data: { name: "Golden", slug: "golden" },
  });
  const whiskas = await prisma.brand.create({
    data: { name: "Whiskas", slug: "whiskas" },
  });
  const racao = await prisma.category.create({
    data: { name: "Ração", slug: "racao" },
  });
  const higiene = await prisma.category.create({
    data: { name: "Higiene", slug: "higiene" },
  });

  return { golden, whiskas, racao, higiene };
}

type ProductSeed = {
  name: string;
  slug: string;
  description?: string;
  status?: "DRAFT" | "ACTIVE" | "DISCONTINUED";
  brandId: string;
  categoryIds: string[];
  priceCents?: number;
  sku?: string;
};

async function seedProduct(seed: ProductSeed) {
  return prisma.product.create({
    data: {
      name: seed.name,
      slug: seed.slug,
      description: seed.description ?? `Descrição de ${seed.name}`,
      brandId: seed.brandId,
      status: seed.status ?? "ACTIVE",
      categories: {
        create: seed.categoryIds.map((categoryId) => ({ categoryId })),
      },
      variants: {
        create: [
          {
            sku: seed.sku ?? seed.slug.toUpperCase(),
            label: "Único",
            priceCents: seed.priceCents ?? 1000,
            stockQuantity: 10,
            isDefault: true,
          },
        ],
      },
    },
  });
}

const namesOf = (body: { data: { name: string }[] }) =>
  body.data.map((product) => product.name);

describe("GET /api/v1/products?q= — casamento textual", () => {
  it("should find a product by words of its name, ignoring accents", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await seedProduct({
      name: "Shampoo Neutro",
      slug: "shampoo-neutro",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get("/api/v1/products?q=racao golden");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Adulto"]);
  });

  it("should find a product despite a typo in the searched word", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await refreshSearchDictionary();

    const response = await request(app).get("/api/v1/products?q=golen");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Adulto"]);
    expect(response.body.meta.search).toEqual({
      q: "golen",
      applied: "golden",
    });
  });

  /**
   * O caso que decidiu a Z5. As duas estratégias que o ADR previa (fallback no
   * vazio, pontuação combinada) falham exatamente aqui: `racao & golen` é um E,
   * e uma das duas palavras não existe.
   */
  it("should correct only the misspelled word of a multi-word search", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await refreshSearchDictionary();

    const response = await request(app).get("/api/v1/products?q=racao golen");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Adulto"]);
    expect(response.body.meta.search.applied).toBe("racao golden");
  });

  it("should find nothing when the searched word has no close match", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await refreshSearchDictionary();

    const response = await request(app).get("/api/v1/products?q=xyzabc");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
    // Palavra incorrigível vai como está (Z13): a busca é honesta em devolver
    // vazio, em vez de descartá-la e responder outra pergunta.
    expect(response.body.meta.search.applied).toBe("xyzabc");
  });

  /**
   * Regressão da revisão da 9.9. Corrigir **sempre** trocava uma palavra
   * legítima pela vizinha mais parecida quando o produto era mais novo que o
   * último refresh do dicionário — e o produto certo nunca aparecia. A busca
   * literal roda primeiro justamente para isso.
   */
  it("should not correct a word that matches a product created after the last refresh", async () => {
    const { golden, whiskas, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Whiskas Sachê Carne",
      slug: "whiskas-sache-carne",
      brandId: whiskas.id,
      categoryIds: [racao.id],
    });
    await refreshSearchDictionary();

    // Depois do refresh: "whisky" não está no dicionário, e "whiskas" está.
    await seedProduct({
      name: "Whisky Petisco Natural",
      slug: "whisky-petisco-natural",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get("/api/v1/products?q=whisky");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Whisky Petisco Natural"]);
    expect(response.body.meta.search.applied).toBe("whisky");
  });
});

describe("GET /api/v1/products?q= — ordem por relevância", () => {
  /**
   * A mesma palavra em três lugares diferentes, e a asserção é a **ordem
   * exata** — não "o esperado está na lista". Nome pesa A, descrição pesa C
   * (Z12), e a marca entra somando com fator 0.4.
   */
  it("should rank a name match above a brand match, and both above a description match", async () => {
    const { golden, whiskas, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Golden Original",
      slug: "golden-original",
      description: "Produto de linha premium",
      brandId: whiskas.id,
      categoryIds: [racao.id],
    });
    await seedProduct({
      name: "Ração Suprema",
      slug: "racao-suprema",
      description: "Fórmula golden para cães adultos",
      brandId: whiskas.id,
      categoryIds: [racao.id],
    });
    await seedProduct({
      name: "Petisco Natural",
      slug: "petisco-natural",
      description: "Feito com ingredientes selecionados",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get("/api/v1/products?q=golden");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual([
      "Golden Original",
      "Petisco Natural",
      "Ração Suprema",
    ]);
  });
});

describe("GET /api/v1/products?q= — o recorte visível vence a busca", () => {
  /**
   * O par é o teste: sem o caso do funcionário, este passaria mesmo que a busca
   * simplesmente não encontrasse nada — verde vazio, a lição da 9.8.
   */
  it("should not surface a DRAFT product to an anonymous search", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Lançamento",
      slug: "racao-golden-lancamento",
      status: "DRAFT",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get("/api/v1/products?q=lancamento");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  it("should surface the same DRAFT product to whoever can see internals", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Lançamento",
      slug: "racao-golden-lancamento",
      status: "DRAFT",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    const employee = await buildEmployee({ roleNames: ["catalog-manager"] });
    const token = await loginAs(employee.email, employee.password);

    const response = await request(app)
      .get("/api/v1/products?q=lancamento")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Lançamento"]);
  });
});

describe("GET /api/v1/products?q= — composição com os demais parâmetros", () => {
  it("should intersect the search with a category filter", async () => {
    const { golden, racao, higiene } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await seedProduct({
      name: "Shampoo Golden Suave",
      slug: "shampoo-golden-suave",
      brandId: golden.id,
      categoryIds: [higiene.id],
    });

    const response = await request(app).get(
      "/api/v1/products?q=golden&category=higiene",
    );

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Shampoo Golden Suave"]);
  });

  it("should intersect the search with a tag filter", async () => {
    const { golden, racao } = await seedTaxonomy();
    const promocao = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });
    const emPromocao = await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
    });
    await prisma.productTag.create({
      data: { productId: emPromocao.id, tagId: promocao.id },
    });
    await seedProduct({
      name: "Ração Golden Filhote",
      slug: "racao-golden-filhote",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get(
      "/api/v1/products?q=golden&tag=promocao",
    );

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Adulto"]);
  });

  it("should order the search results by price when asked to", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
      priceCents: 9000,
    });
    await seedProduct({
      name: "Ração Golden Filhote",
      slug: "racao-golden-filhote",
      brandId: golden.id,
      categoryIds: [racao.id],
      priceCents: 2000,
    });

    const response = await request(app).get(
      "/api/v1/products?q=golden&sort=price",
    );

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual([
      "Ração Golden Filhote",
      "Ração Golden Adulto",
    ]);
  });
});

describe("GET /api/v1/products?q= — contrato de entrada", () => {
  it("should reject sort=relevance without a search term", async () => {
    const response = await request(app).get("/api/v1/products?sort=relevance");

    expectValidationError(response, ["sort"]);
  });

  it("should reject a blank search term", async () => {
    const response = await request(app).get("/api/v1/products?q=%20%20");

    expectValidationError(response, ["q"]);
  });
});

describe("GET /api/v1/products?q= — atalho de SKU", () => {
  it("should return the product whose SKU was typed in full", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
      sku: "ZK9912",
    });
    await seedProduct({
      name: "Shampoo Neutro",
      slug: "shampoo-neutro",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get("/api/v1/products?q=zk9912");

    expect(response.status).toBe(200);
    expect(namesOf(response.body)).toEqual(["Ração Golden Adulto"]);
  });

  it("should keep the SKU match first even when the ranking is reversed", async () => {
    const { golden, racao } = await seedTaxonomy();
    await seedProduct({
      name: "Ração Golden Adulto",
      slug: "racao-golden-adulto",
      brandId: golden.id,
      categoryIds: [racao.id],
      sku: "ZK9912",
    });
    await seedProduct({
      name: "Ração Golden Filhote",
      slug: "racao-golden-filhote",
      brandId: golden.id,
      categoryIds: [racao.id],
    });

    const response = await request(app).get(
      "/api/v1/products?q=zk9912&sort=relevance&order=asc",
    );

    expect(response.status).toBe(200);
    expect(namesOf(response.body)[0]).toBe("Ração Golden Adulto");
  });
});
