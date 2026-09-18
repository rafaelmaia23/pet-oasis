import { describe, expect, it } from "vitest";
import { PetSpecies } from "@/generated/prisma/enums";
import {
  DEFAULT_BREEDS,
  SPECIES_WITH_BREED,
  SRD_BREED_NAME,
} from "@/modules/breed/breed.constants";

const ALL_SPECIES = Object.values(PetSpecies);

const breedsOf = (species: PetSpecies) =>
  DEFAULT_BREEDS.filter((breed) => breed.species === species);

describe("catálogo de raças", () => {
  it("não repete o par (species, name) — é a chave do @@unique e do seed", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const { species, name } of DEFAULT_BREEDS) {
      const key = `${species}:${name}`;

      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }

    expect(duplicates).toEqual([]);
  });

  it("declara raças apenas para as espécies de SPECIES_WITH_BREED", () => {
    // A invariante que impede a constante e o enum de divergirem em silêncio:
    // semear raça para uma espécie fora da lista faria o `pet.service` (9.4)
    // recusar (422 "espécie não aceita raça") uma raça que o `GET /breeds`
    // acabou de oferecer no select.
    const speciesWithBreed = new Set<string>(SPECIES_WITH_BREED);

    const unexpected = [
      ...new Set(
        DEFAULT_BREEDS.map((breed) => breed.species).filter(
          (species) => !speciesWithBreed.has(species),
        ),
      ),
    ];

    expect(unexpected).toEqual([]);
  });

  it("dá pelo menos uma raça a toda espécie de SPECIES_WITH_BREED", () => {
    // O outro lado da invariante acima: espécie que exige raça sem nenhuma
    // raça semeada torna o cadastro de pet impossível para ela.
    for (const species of SPECIES_WITH_BREED) {
      expect(
        breedsOf(species).length,
        `espécie "${species}" exige raça mas não tem nenhuma declarada`,
      ).toBeGreaterThan(0);
    }
  });

  it("semeia a linha SRD para toda espécie com raça", () => {
    // Sem ela o vira-lata — que é a maioria da clientela real — não tem o que
    // selecionar, e a espécie exige raça.
    for (const species of SPECIES_WITH_BREED) {
      const names = breedsOf(species).map((breed) => breed.name);

      expect(names, `espécie "${species}" não tem a linha SRD`).toContain(
        SRD_BREED_NAME,
      );
    }
  });

  it("mantém SPECIES_WITH_BREED dentro do enum PetSpecies", () => {
    for (const species of SPECIES_WITH_BREED) {
      expect(ALL_SPECIES).toContain(species);
    }
  });

  it("usa nomes limpos — sem vazio, sem sobra de trim, sem espaço duplicado", () => {
    const dirty = DEFAULT_BREEDS.filter(
      ({ name }) =>
        name.length === 0 || name !== name.trim() || /\s{2,}/.test(name),
    );

    expect(dirty).toEqual([]);
  });
});
