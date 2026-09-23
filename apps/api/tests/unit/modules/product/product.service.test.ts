import type { VariantInput } from "@pet-oasis/api-contracts/catalog";
import { describe, expect, it } from "vitest";
import {
  withAvailability,
  withResolvedDefault,
} from "@/modules/product/product.service";

const variant = (sku: string, isDefault?: boolean): VariantInput => ({
  sku,
  label: sku,
  priceCents: 1000,
  ...(isDefault === undefined ? {} : { isDefault }),
});

/**
 * Função pura: é a eleição da variante default no corpo de criação (9.7/X5).
 * "Mais de uma marcada" não aparece aqui porque o schema já a recusa — o que
 * sobra para o service é o caso silencioso, nenhuma marcada.
 */
describe("withResolvedDefault", () => {
  it("promotes the first variant when none is marked", () => {
    const result = withResolvedDefault([variant("A"), variant("B")]);

    expect(result.map((item) => item.isDefault)).toEqual([true, false]);
  });

  it("honours the explicitly marked variant", () => {
    const result = withResolvedDefault([variant("A"), variant("B", true)]);

    expect(result.map((item) => item.isDefault)).toEqual([false, true]);
  });

  it("keeps a single variant as the default", () => {
    expect(withResolvedDefault([variant("A")])[0]?.isDefault).toBe(true);
  });

  it("does not promote the first when another is marked as false", () => {
    // `isDefault: false` explícito não é "sem preferência": a marcação existe,
    // e promover a primeira aqui contrariaria o corpo enviado.
    const result = withResolvedDefault([
      variant("A", false),
      variant("B", true),
    ]);

    expect(result.map((item) => item.isDefault)).toEqual([false, true]);
  });

  it("drops the keys the caller left undefined", () => {
    // O Prisma recusa a chave presente valendo `undefined` sob
    // `exactOptionalPropertyTypes` — é o que `definedOnly` resolve aqui dentro.
    const result = withResolvedDefault([variant("A")]);

    expect(result[0]).not.toHaveProperty("weightGrams");
  });
});

/**
 * Disponibilidade derivada (9.8/Y4): a vitrine mostra "tem" ou "não tem", nunca
 * a quantidade — que é informação competitiva e não muda nada para quem compra.
 * O booleano entra em **todas** as views (Y10), então é calculado uma vez aqui e
 * não em cada presenter.
 */
describe("withAvailability", () => {
  const stocked = (stockQuantity: number) => ({ sku: "X", stockQuantity });

  it("derives inStock per variant from the exact quantity", () => {
    const result = withAvailability({ variants: [stocked(3), stocked(0)] });

    expect(result.variants.map((item) => item.inStock)).toEqual([true, false]);
  });

  it("marks the product as in stock when any variant has stock", () => {
    // O seletor da vitrine sabe qual tamanho esgotou; o card da listagem só
    // precisa saber se vale mostrar o produto.
    expect(
      withAvailability({ variants: [stocked(0), stocked(1)] }),
    ).toHaveProperty("inStock", true);
  });

  it("marks the product as out of stock when every variant is zeroed", () => {
    expect(
      withAvailability({ variants: [stocked(0), stocked(0)] }),
    ).toHaveProperty("inStock", false);
  });

  it("keeps the other fields of the variant untouched", () => {
    const result = withAvailability({ variants: [stocked(3)] });

    expect(result.variants[0]).toMatchObject({ sku: "X", stockQuantity: 3 });
  });
});
