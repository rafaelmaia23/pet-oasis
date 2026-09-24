import { faker } from "@faker-js/faker";
import {
  type CreatePetInput,
  createPetSchema,
} from "@pet-oasis/api-contracts/pet";
import { fixtureAudit } from "@tests/helpers/audit";
import { PetSpecies } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { SRD_BREED_NAME } from "@/modules/breed/breed.constants";
import { createPet } from "@/modules/pet/pet.repository";

/**
 * A raça é resolvida por **nome** no catálogo já semeado pelo `globalSetup` —
 * `Breed` sobrevive ao `clearDatabase` (é dado de referência, 9.3), então
 * nenhum teste de pet precisa de setup próprio de raça.
 */
export async function findSrdBreedId(species: PetSpecies): Promise<string> {
  const breed = await prisma.breed.findUniqueOrThrow({
    where: { species_name: { species, name: SRD_BREED_NAME } },
  });

  return breed.id;
}

export async function makePetData(
  overrides?: Partial<CreatePetInput>,
): Promise<CreatePetInput> {
  const species = overrides?.species ?? PetSpecies.DOG;

  const rawData = {
    name: overrides?.name ?? faker.animal.dog(),
    species,
    // `breedId` explícito (mesmo `null`) vence; ausente, a factory obedece à
    // regra do domínio — cão e gato exigem raça, as demais espécies a proíbem.
    breedId:
      overrides && "breedId" in overrides
        ? overrides.breedId
        : species === PetSpecies.DOG || species === PetSpecies.CAT
          ? await findSrdBreedId(species)
          : null,
    ...(overrides?.sex !== undefined && { sex: overrides.sex }),
    ...(overrides?.birthDate !== undefined && {
      birthDate: overrides.birthDate,
    }),
    ...(overrides?.birthDateIsEstimated !== undefined && {
      birthDateIsEstimated: overrides.birthDateIsEstimated,
    }),
    ...(overrides?.weightGrams !== undefined && {
      weightGrams: overrides.weightGrams,
    }),
    ...(overrides?.neutered !== undefined && { neutered: overrides.neutered }),
    ...(overrides?.microchipId !== undefined && {
      microchipId: overrides.microchipId,
    }),
    ...(overrides?.color !== undefined && { color: overrides.color }),
    ...(overrides?.notes !== undefined && { notes: overrides.notes }),
  };

  return createPetSchema.shape.body.parse(rawData);
}

/**
 * Escreve pelo **repository**, não pelo service: a factory monta *estado*, não
 * exercita o fluxo — passar pelo service exigiria um ator autorizado e geraria
 * linha de audit em todo teste que só precisa de um pet existindo. É o mesmo
 * corte que `user.factory.ts` faz (`createCustomer`, e não `user.service`).
 */
export async function buildPet(
  customerId: string,
  overrides?: Partial<CreatePetInput>,
) {
  const data = await makePetData(overrides);

  return createPet(
    { ...data, customerId },
    fixtureAudit({
      action: "PET_CREATED",
      targetType: "Pet",
      metadata: { customerId, species: data.species, source: "STAFF" },
    }),
  );
}
