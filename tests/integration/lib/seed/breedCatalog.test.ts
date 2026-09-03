import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedBreeds } from "@/lib/seed/seedBreeds";
import {
  DEFAULT_BREEDS,
  SPECIES_WITH_BREED,
  SRD_BREED_NAME,
} from "@/modules/breed/breed.constants";

/**
 * O seed roda uma vez no `globalSetup`. Este teste prova que o que está
 * declarado em `breed.constants.ts` chegou ao banco, e que rodar o seed de novo
 * — que é o que o entrypoint do container faz a cada boot — não duplica nada.
 *
 * Sem `afterEach(clearDatabase)`: `Breed` é dado de referência e o
 * `clearDatabase` não o toca de propósito (garantido por
 * `tests/integration/clearDatabase.guard.test.ts`).
 */
describe("seed do catálogo de raças", () => {
  it("semeia toda raça declarada em DEFAULT_BREEDS", async () => {
    const seeded = await prisma.breed.findMany();

    expect(seeded).toHaveLength(DEFAULT_BREEDS.length);

    const seededKeys = new Set(
      seeded.map((breed) => `${breed.species}:${breed.name}`),
    );

    for (const { species, name } of DEFAULT_BREEDS) {
      expect(
        seededKeys.has(`${species}:${name}`),
        `raça "${name}" (${species}) não foi semeada`,
      ).toBe(true);
    }
  });

  it("é idempotente — rodar de novo não cria nem duplica linha", async () => {
    const before = await prisma.breed.count();

    const created = await seedBreeds(prisma);

    expect(created).toBe(0);
    expect(await prisma.breed.count()).toBe(before);
  });

  it("semeia a linha SRD para toda espécie que exige raça", async () => {
    for (const species of SPECIES_WITH_BREED) {
      const srd = await prisma.breed.findUnique({
        where: { species_name: { species, name: SRD_BREED_NAME } },
      });

      expect(srd, `espécie "${species}" ficou sem a linha SRD`).not.toBeNull();
    }
  });

  it("não semeia raça para espécie fora de SPECIES_WITH_BREED", async () => {
    const speciesWithBreed = [...SPECIES_WITH_BREED];

    const strays = await prisma.breed.findMany({
      where: { species: { notIn: speciesWithBreed } },
    });

    expect(strays).toEqual([]);
  });
});
