import { describe, expect, it } from "vitest";
import { PetSpecies, ProductStatus } from "@/generated/prisma/enums";
import { productPresenter } from "@/modules/product/product.presenter";

/**
 * A whitelist do Zod é o corte de verdade das views por capability (9.8): quem
 * decide o que o cliente vê não é o service, é o `.parse()` — campo que a view
 * não lista some da resposta mesmo que o service o entregue por descuido.
 *
 * Testar isso aqui, com o registro **inteiro** na entrada, é o que prova o
 * corte sem depender de a rota estar montada.
 */
const row = {
  id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  name: "Ração Golden Adulto",
  slug: "racao-golden-adulto",
  description: "Ração seca para cães adultos.",
  status: ProductStatus.ACTIVE,
  targetSpecies: [PetSpecies.DOG],
  inStock: true,
  brand: {
    id: "6b6f8d2e-6e6a-4a4e-9a3f-1b2c3d4e5f60",
    name: "Golden",
    slug: "golden",
    description: null,
    logoPath: null,
  },
  categories: [
    {
      id: "9a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d",
      name: "Ração seca",
      slug: "racao-seca",
      parentId: null,
    },
  ],
  tags: [
    {
      id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      name: "Promoção",
      slug: "promocao",
    },
  ],
  variants: [
    {
      id: "2a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      sku: "GOLDEN-AD-15KG",
      label: "15 kg",
      priceCents: 24990,
      compareAtPriceCents: null,
      costCents: 15000,
      stockQuantity: 12,
      weightGrams: 15000,
      volumeMl: null,
      sizeLabel: null,
      barcode: null,
      isDefault: true,
      inStock: true,
    },
  ],
};

describe("productViews.public", () => {
  const view = productPresenter.present(row, "public");

  it("drops costCents and stockQuantity — the contract test of the storefront", () => {
    expect(view).not.toHaveProperty("variants.0.costCents");
    expect(view).not.toHaveProperty("variants.0.stockQuantity");
  });

  it("drops status, which never varies for the public anyway", () => {
    // O público só alcança produto ACTIVE (Y8); devolver o campo convidaria o
    // cliente a ramificar por um valor que nunca muda.
    expect(view).not.toHaveProperty("status");
  });

  it("keeps availability in place of the exact quantity (Y4)", () => {
    expect(view).toHaveProperty("inStock", true);
    expect(view.variants[0]).toHaveProperty("inStock", true);
  });

  it("keeps price, brand, categories and tags", () => {
    expect(view.variants[0]?.priceCents).toBe(24990);
    expect(view.brand.slug).toBe("golden");
    expect(view.categories[0]?.slug).toBe("racao-seca");
    expect(view.tags[0]?.slug).toBe("promocao");
  });
});

describe("productViews.internal", () => {
  const view = productPresenter.present(row, "internal");

  it("unlocks the exact stock and the status, and keeps the cost hidden", () => {
    expect(view.variants[0]).toHaveProperty("stockQuantity", 12);
    expect(view).toHaveProperty("status", ProductStatus.ACTIVE);
    expect(view).not.toHaveProperty("variants.0.costCents");
  });
});

describe("productViews.cost", () => {
  const view = productPresenter.present(row, "cost");

  it("unlocks the cost on top of the internal view (Y9)", () => {
    expect(view.variants[0]).toHaveProperty("costCents", 15000);
    expect(view.variants[0]).toHaveProperty("stockQuantity", 12);
  });
});

describe("every view", () => {
  it("carries inStock, so no client branches by view to know it (Y10)", () => {
    for (const name of ["public", "internal", "cost"] as const) {
      const view = productPresenter.present(row, name);

      expect(view).toHaveProperty("inStock", true);
      expect(view.variants[0]).toHaveProperty("inStock", true);
    }
  });
});
