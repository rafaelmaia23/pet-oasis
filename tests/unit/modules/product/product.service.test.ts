import { describe, expect, it } from "vitest";
import { withResolvedDefault } from "@/modules/product/product.service";
import type { VariantInput } from "@/modules/product/product.variant.schema";

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
