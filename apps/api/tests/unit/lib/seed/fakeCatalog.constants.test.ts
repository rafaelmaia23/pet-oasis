import { describe, expect, it } from "vitest";
import {
  FAKE_BRANDS,
  FAKE_CATEGORIES,
  FAKE_PRODUCTS,
  FAKE_TAGS,
} from "@/lib/seed/fakeCatalog.constants";
import { FAKE_IMAGE_KEYS } from "@/lib/seed/fakeImages.constants";

/**
 * Invariantes do roster do catálogo fake (9.11/AB7, AB8, AB10) — sem banco.
 *
 * O que estes testes protegem é o dataset **como conteúdo**: se alguém
 * acrescentar um produto e esquecer a categoria, ou remover a única variante
 * esgotada, o seed continua rodando e a demo silenciosamente para de demonstrar
 * o que a Fase 9 construiu. Um roster errado não estoura em lugar nenhum — é
 * por isso que os cenários são afirmados aqui, e não só descritos em comentário.
 */

const brandSlugs = new Set(FAKE_BRANDS.map((brand) => brand.slug));
const categorySlugs = new Set(FAKE_CATEGORIES.map((category) => category.slug));
const tagSlugs = new Set(FAKE_TAGS.map((tag) => tag.slug));

describe("FAKE_BRANDS", () => {
  it("has nine brands, one or two per branch of the tree", () => {
    expect(FAKE_BRANDS).toHaveLength(9);
  });

  it("has unique slugs and unique names", () => {
    expect(brandSlugs.size).toBe(FAKE_BRANDS.length);
    expect(new Set(FAKE_BRANDS.map((brand) => brand.name)).size).toBe(
      FAKE_BRANDS.length,
    );
  });

  it("points every logo at an asset that exists", () => {
    for (const brand of FAKE_BRANDS) {
      expect(FAKE_IMAGE_KEYS).toContain(brand.logo);
    }
  });
});

describe("FAKE_CATEGORIES", () => {
  it("has twenty nodes and unique slugs", () => {
    expect(FAKE_CATEGORIES).toHaveLength(20);
    expect(categorySlugs.size).toBe(FAKE_CATEGORIES.length);
  });

  // A self-FK `Category.parentId` só encontra o pai se ele vier antes no array
  // — o seed depende da ordem, e não a reordena.
  it("declares every parent before the child that references it", () => {
    const seen = new Set<string>();

    for (const category of FAKE_CATEGORIES) {
      if (category.parentSlug !== null) {
        expect(seen).toContain(category.parentSlug);
      }

      seen.add(category.slug);
    }
  });

  it("reaches the third level, which is the depth the service validates", () => {
    const parentOf = new Map(
      FAKE_CATEGORIES.map((category) => [category.slug, category.parentSlug]),
    );

    function depthOf(slug: string): number {
      const parent = parentOf.get(slug) ?? null;

      return parent === null ? 1 : depthOf(parent) + 1;
    }

    const depths = FAKE_CATEGORIES.map((category) => depthOf(category.slug));

    expect(Math.max(...depths)).toBe(3);
  });
});

describe("FAKE_TAGS", () => {
  it("has eight transversal tags with unique slugs", () => {
    expect(FAKE_TAGS).toHaveLength(8);
    expect(tagSlugs.size).toBe(FAKE_TAGS.length);
  });
});

describe("FAKE_PRODUCTS", () => {
  it("has thirty-five products with unique slugs", () => {
    expect(FAKE_PRODUCTS).toHaveLength(35);
    expect(new Set(FAKE_PRODUCTS.map((product) => product.slug)).size).toBe(35);
  });

  /**
   * `status` e `deletedAt` são **ortogonais** (ADR product-catalog-modeling):
   * "isto está à venda?" e "isto existe?" são perguntas diferentes, então o
   * produto soft-deletado continua com status `ACTIVE`. Daí 29 `ACTIVE` no
   * roster e **28** de fato visíveis — e 28 é o que dá duas páginas na vitrine
   * pública no `limit` default de 20, sem o qual o dataset esconderia o furo de
   * paginação que a 9.2 fechou.
   */
  it("splits status as 29 ACTIVE (28 of them visible), 4 DRAFT and 2 DISCONTINUED", () => {
    const byStatus = (status: string) =>
      FAKE_PRODUCTS.filter((product) => product.status === status).length;

    expect(byStatus("ACTIVE")).toBe(29);
    expect(byStatus("DRAFT")).toBe(4);
    expect(byStatus("DISCONTINUED")).toBe(2);

    const softDeleted = FAKE_PRODUCTS.filter(
      (product) => product.softDeleted === true,
    );

    expect(softDeleted).toHaveLength(1);
    expect(softDeleted[0]?.status).toBe("ACTIVE");

    const visibleActive = FAKE_PRODUCTS.filter(
      (product) =>
        product.status === "ACTIVE" && product.softDeleted === undefined,
    );

    expect(visibleActive).toHaveLength(28);
  });

  it("has globally unique SKUs across every variant", () => {
    const skus = FAKE_PRODUCTS.flatMap((product) =>
      product.variants.map((variant) => variant.sku),
    );

    expect(new Set(skus).size).toBe(skus.length);
  });

  it("gives every product a brand, at least one category and at least one variant", () => {
    for (const product of FAKE_PRODUCTS) {
      expect(brandSlugs).toContain(product.brandSlug);
      expect(product.categorySlugs.length).toBeGreaterThanOrEqual(1);
      expect(product.variants.length).toBeGreaterThanOrEqual(1);

      for (const slug of product.categorySlugs) {
        expect(categorySlugs).toContain(slug);
      }

      for (const slug of product.tagSlugs) {
        expect(tagSlugs).toContain(slug);
      }
    }
  });

  it("uses each product image asset exactly once", () => {
    const used = FAKE_PRODUCTS.flatMap((product) => product.images);

    expect(new Set(used).size).toBe(used.length);

    for (const key of used) {
      expect(FAKE_IMAGE_KEYS).toContain(key);
    }
  });

  it("declares a price range that is ordered and positive", () => {
    for (const product of FAKE_PRODUCTS) {
      for (const variant of product.variants) {
        const [min, max] = variant.priceRange;

        expect(min).toBeGreaterThan(0);
        expect(max).toBeGreaterThanOrEqual(min);
      }
    }
  });

  describe("scenario coverage (AB10)", () => {
    it("has exactly one product with no image at all", () => {
      const withoutImage = FAKE_PRODUCTS.filter(
        (product) => product.images.length === 0,
      );

      expect(withoutImage).toHaveLength(1);
    });

    it("has exactly one product carrying a gallery of three", () => {
      const galleries = FAKE_PRODUCTS.filter(
        (product) => product.images.length === 3,
      );

      expect(galleries).toHaveLength(1);
    });

    it("has at least eight multi-variant products", () => {
      const multi = FAKE_PRODUCTS.filter(
        (product) => product.variants.length > 1,
      );

      expect(multi.length).toBeGreaterThanOrEqual(8);
    });

    // Dois esgotados de forma **diferente**: o produto inteiro em zero e o
    // produto cuja variante default está em zero com as outras em estoque.
    it("has one fully out-of-stock product and one with only some variants out", () => {
      const outOfStock = FAKE_PRODUCTS.filter((product) =>
        product.variants.some((variant) => variant.stockQuantity === 0),
      );

      expect(outOfStock).toHaveLength(2);

      const fully = outOfStock.filter((product) =>
        product.variants.every((variant) => variant.stockQuantity === 0),
      );
      const partially = outOfStock.filter((product) =>
        product.variants.some((variant) => variant.stockQuantity !== 0),
      );

      expect(fully).toHaveLength(1);
      expect(partially).toHaveLength(1);
      // A esgotada do parcial é a **primeira**, que é a que
      // `withResolvedDefault` promove a default (9.7/X5).
      expect(partially[0]?.variants[0]?.stockQuantity).toBe(0);
    });

    it("has at least five products targeting more than one species", () => {
      const multiSpecies = FAKE_PRODUCTS.filter(
        (product) => product.targetSpecies.length > 1,
      );

      expect(multiSpecies.length).toBeGreaterThanOrEqual(5);
    });

    it("has four discounted variants, for the compare-at price", () => {
      const discounted = FAKE_PRODUCTS.flatMap((product) =>
        product.variants.filter((variant) => variant.discounted === true),
      );

      expect(discounted).toHaveLength(4);
    });

    // Folha de 3º nível com item único: a categoria mais profunda e mais rasa
    // em produtos ao mesmo tempo.
    it("has a third-level leaf holding exactly one product", () => {
      const perCategory = new Map<string, number>();

      for (const product of FAKE_PRODUCTS) {
        for (const slug of product.categorySlugs) {
          perCategory.set(slug, (perCategory.get(slug) ?? 0) + 1);
        }
      }

      expect(perCategory.get("condicionador")).toBe(1);
    });
  });
});
