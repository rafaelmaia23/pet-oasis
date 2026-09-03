import { describe, expect, it } from "vitest";
import { definedOnly } from "@/utils/definedOnly";

/**
 * O util existe para reconciliar o opcional do Zod (`campo?: T | undefined`)
 * com o do Prisma (`campo?: T`) sob `exactOptionalPropertyTypes`. O que precisa
 * ser provado é comportamental: `undefined` some, `null` **fica** — porque no
 * domínio `null` é uma escolha do cliente ("limpe este campo") e `undefined` é
 * ausência.
 */
describe("definedOnly", () => {
  it("removes keys whose value is undefined", () => {
    const result = definedOnly({ name: "Bidu", color: undefined });

    expect(result).toEqual({ name: "Bidu" });
    expect("color" in result).toBe(false);
  });

  it("keeps null, which means 'clear this field'", () => {
    const result = definedOnly({ breedId: null, weightGrams: 0 });

    expect(result).toEqual({ breedId: null, weightGrams: 0 });
  });

  it("keeps falsy values that are not undefined", () => {
    const result = definedOnly({
      neutered: false,
      notes: "",
      weightGrams: 0,
      sex: undefined,
    });

    expect(result).toEqual({ neutered: false, notes: "", weightGrams: 0 });
  });

  it("returns an empty object when everything is undefined", () => {
    expect(definedOnly({ a: undefined, b: undefined })).toEqual({});
  });
});
