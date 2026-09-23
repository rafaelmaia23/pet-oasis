import { describe, expect, it } from "vitest";
import { slugify } from "@/utils/slugify";

/**
 * O slug é gerado do nome na criação e **congelado** depois (9.6/W4), então o
 * que esta função devolve vira URL pública e não muda mais. O que precisa ser
 * provado é comportamental: acento some sem virar hífen, pontuação vira
 * separador, e o resultado nunca tem hífen sobrando nas pontas nem repetido.
 */
describe("slugify", () => {
  it("removes diacritics instead of turning them into separators", () => {
    expect(slugify("Ração Seca")).toBe("racao-seca");
    expect(slugify("Cão & Companhia")).toBe("cao-companhia");
    expect(slugify("Ninho Órfão")).toBe("ninho-orfao");
  });

  it("lowercases and joins words with a single hyphen", () => {
    expect(slugify("Alimentação")).toBe("alimentacao");
    expect(slugify("Tapete   Higiênico")).toBe("tapete-higienico");
  });

  it("keeps digits, which carry meaning in catalog names", () => {
    expect(slugify("Ração Golden 15kg")).toBe("racao-golden-15kg");
  });

  it("collapses punctuation into separators and trims the edges", () => {
    expect(slugify("  --Promoção!!!  ")).toBe("promocao");
    expect(slugify("Higiene / Banho")).toBe("higiene-banho");
    expect(slugify("Pet's Choice")).toBe("pet-s-choice");
  });

  it("returns an empty string when nothing sluggable is left", () => {
    // O caller decide o que fazer com isto — no módulo de catálogo vira 422,
    // porque um nome só de símbolos não produz URL utilizável.
    expect(slugify("!!!")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});
