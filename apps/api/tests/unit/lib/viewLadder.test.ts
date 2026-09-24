import {
  productListLadder,
  productListSchemas,
  productReadLadder,
  productViews,
  productWriteLadder,
  variantViews,
  variantWriteLadder,
} from "@pet-oasis/api-contracts/catalog";
import { userViewLadder, userViews } from "@pet-oasis/api-contracts/user";
import { makeAuthUser } from "@tests/factories/user.factory";
import { describe, expect, it } from "vitest";
import { chooseView, reachesBeyondBase } from "@/lib/viewLadder";

// `chooseView` é o único ponto de leitura da correspondência degrau → feature
// (issue 17 de `.scratch/fase-12-module-depth/`); a tabela abaixo é o que
// vaza dado quando erra — a feature errada aqui devolve o degrau errado, e o
// teste é o que fica vermelho antes de um cliente ver o que não devia.

describe("chooseView()", () => {
  it("devolve o degrau base quando o ator não existe", () => {
    expect(chooseView(productReadLadder, undefined)).toBe(productViews.public);
  });

  it("devolve o degrau base quando o ator não tem nenhuma feature da escada", () => {
    expect(chooseView(productReadLadder, makeAuthUser(["read:user"]))).toBe(
      productViews.public,
    );
  });

  it("lê a escada do degrau mais alto para baixo: uma feature de degrau baixo não vence a de um mais alto já concedida", () => {
    const actor = makeAuthUser(["read:product:cost", "read:product:internal"]);

    expect(chooseView(productReadLadder, actor)).toBe(productViews.cost);
  });

  // Uma tabela por escada — os degraus e as views não têm o mesmo shape entre
  // usuário, produto e variante, então o teste não tenta unificá-los.
  describe("mapa feature → passo de userViewLadder", () => {
    it.each([
      { features: [], expected: userViews.owner },
      { features: ["read:user"], expected: userViews.owner },
      { features: ["read:user:others"], expected: userViews.admin },
    ])("com $features escolhe o degrau declarado", ({ features, expected }) => {
      expect(chooseView(userViewLadder, makeAuthUser(features))).toBe(expected);
    });
  });

  describe("mapa feature → passo de productReadLadder", () => {
    it.each([
      { features: [], expected: productViews.public },
      { features: ["read:product:internal"], expected: productViews.internal },
      { features: ["read:product:cost"], expected: productViews.cost },
    ])("com $features escolhe o degrau declarado", ({ features, expected }) => {
      expect(chooseView(productReadLadder, makeAuthUser(features))).toBe(
        expected,
      );
    });
  });

  describe("mapa feature → passo de productWriteLadder", () => {
    it.each([
      { features: ["manage:product"], expected: productViews.internal },
      {
        features: ["manage:product", "read:product:cost"],
        expected: productViews.cost,
      },
    ])("com $features escolhe o degrau declarado", ({ features, expected }) => {
      expect(chooseView(productWriteLadder, makeAuthUser(features))).toBe(
        expected,
      );
    });
  });

  describe("mapa feature → passo de variantWriteLadder", () => {
    it.each([
      { features: ["manage:product"], expected: variantViews.internal },
      {
        features: ["manage:product", "read:product:cost"],
        expected: variantViews.cost,
      },
    ])("com $features escolhe o degrau declarado", ({ features, expected }) => {
      expect(chooseView(variantWriteLadder, makeAuthUser(features))).toBe(
        expected,
      );
    });
  });

  describe("mapa feature → passo de productListLadder", () => {
    it.each([
      { features: [], expected: productListSchemas[0] },
      { features: ["read:product:internal"], expected: productListSchemas[1] },
      { features: ["read:product:cost"], expected: productListSchemas[2] },
    ])("com $features escolhe o degrau declarado", ({ features, expected }) => {
      expect(chooseView(productListLadder, makeAuthUser(features))).toBe(
        expected,
      );
    });
  });
});

describe("reachesBeyondBase()", () => {
  it("é falso no degrau base", () => {
    expect(reachesBeyondBase(productReadLadder, undefined)).toBe(false);
    expect(
      reachesBeyondBase(productReadLadder, makeAuthUser(["read:user"])),
    ).toBe(false);
  });

  it("é verdadeiro em qualquer degrau além do base", () => {
    expect(
      reachesBeyondBase(
        productReadLadder,
        makeAuthUser(["read:product:internal"]),
      ),
    ).toBe(true);
    expect(
      reachesBeyondBase(productReadLadder, makeAuthUser(["read:product:cost"])),
    ).toBe(true);
  });
});
