import { describe, expect, it } from "vitest";
import { seededFaker, stableSeed } from "@/lib/seed/seedFaker";

/**
 * O que estes testes protegem é a propriedade da AB13: o roster do seed é um
 * **conjunto**, não uma sequência. Antes da 9.11 o `faker` era uma instância
 * semeada uma vez e consumida em laço, então inserir uma entrada no meio do
 * `FAKE_USER_ROSTER` mudava nome e telefone de toda entrada posterior — e a
 * 9.11 é exatamente uma sessão que apende ao roster (dois funcionários novos),
 * com a Fase 10 vindo atrás.
 */

describe("stableSeed", () => {
  it("is deterministic for the same key", () => {
    expect(stableSeed("customer01@fake.petoasis.dev")).toBe(
      stableSeed("customer01@fake.petoasis.dev"),
    );
  });

  it("differs for different keys", () => {
    expect(stableSeed("customer01@fake.petoasis.dev")).not.toBe(
      stableSeed("customer02@fake.petoasis.dev"),
    );
  });

  it("stays inside the unsigned 32-bit range faker accepts", () => {
    for (const key of ["a", "b", "variant:GLD-AD-15KG", ""]) {
      const seed = stableSeed(key);

      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffff_ffff);
    }
  });
});

describe("seededFaker", () => {
  it("gives the same value for the same key, however many other keys came between", () => {
    const first = seededFaker("owner@example.test").person.fullName();

    seededFaker("someone-else@example.test").person.fullName();
    seededFaker("yet-another@example.test").person.fullName();

    const again = seededFaker("owner@example.test").person.fullName();

    expect(again).toBe(first);
  });

  it("gives different values for different keys", () => {
    const one = seededFaker("one@example.test").person.fullName();
    const two = seededFaker("two@example.test").person.fullName();

    expect(one).not.toBe(two);
  });

  /**
   * A propriedade que importa, dita diretamente: consumir as chaves em ordem
   * inversa produz exatamente o mesmo mapa chave → valor. Com uma instância
   * sequencial isso falharia.
   */
  it("is independent of the order in which the keys are consumed", () => {
    const keys = ["k1", "k2", "k3", "k4"];

    const forward = new Map(
      keys.map((key) => [key, seededFaker(key).person.fullName()]),
    );
    const backward = new Map(
      [...keys]
        .reverse()
        .map((key) => [key, seededFaker(key).person.fullName()]),
    );

    for (const key of keys) {
      expect(backward.get(key)).toBe(forward.get(key));
    }
  });
});
