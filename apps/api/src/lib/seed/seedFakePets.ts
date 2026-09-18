import { prisma } from "@/lib/prisma";
import { storeImage } from "@/lib/storage";
import * as petRepository from "@/modules/pet/pet.repository";
import { createPetSchema } from "@/modules/pet/pet.schema";
import { fakeImageBuffer } from "./fakeImages.constants";
import {
  FAKE_PET_ROSTER,
  type FakePet,
  fakePetOwnerEmail,
} from "./fakePets.constants";

export type SeedFakePetsResult = {
  createdCount: number;
  skippedCount: number;
  photosStored: number;
};

/**
 * Ignora `deletedAt` nos dois lados de propósito. No dono, porque o cenário
 * `deleted-user` tem o `User` e o `Customer` soft-deletados e é justamente onde
 * o pet precisa ser criado. No pet, porque `Fumaça` nasce soft-deletado: uma
 * checagem que só olhasse linha ativa tentaria recriá-lo a cada rerun e
 * colidiria no unique global de `microchipId` (9.4/U1).
 */
async function findAnyOwnerCustomer(email: string) {
  const user = await prisma.user.findFirst({
    where: { email },
    include: { customer: true },
  });

  return user?.customer ?? null;
}

async function findAnyPet(customerId: string, name: string) {
  return prisma.pet.findFirst({ where: { customerId, name } });
}

/**
 * A raça vem por **nome** sobre o catálogo semeado (`Breed` é dado de
 * referência, 9.3, e sobrevive ao `clearDatabase`), nunca por id fixo — id muda
 * a cada banco recriado. O `@@unique([species, name])` é o que torna a busca
 * exata.
 */
async function resolveBreedId(pet: FakePet): Promise<string | null> {
  if (pet.breedName === null) return null;

  const breed = await prisma.breed.findUnique({
    where: { species_name: { species: pet.species, name: pet.breedName } },
  });

  if (breed === null) {
    throw new Error(
      `Pet "${pet.name}" declara a raça "${pet.breedName}" para ${pet.species}, que não está no catálogo de Breed`,
    );
  }

  return breed.id;
}

function toPetInput(pet: FakePet, breedId: string | null) {
  return createPetSchema.shape.body.parse({
    name: pet.name,
    species: pet.species,
    breedId,
    sex: pet.sex,
    microchipId: pet.microchipId,
    ...(pet.color !== undefined && { color: pet.color }),
    ...(pet.weightGrams !== undefined && { weightGrams: pet.weightGrams }),
    ...(pet.neutered !== undefined && { neutered: pet.neutered }),
    ...(pet.birthDate !== undefined && { birthDate: pet.birthDate }),
    ...(pet.birthDateIsEstimated !== undefined && {
      birthDateIsEstimated: pet.birthDateIsEstimated,
    }),
    ...(pet.notes !== undefined && { notes: pet.notes }),
  });
}

/**
 * Cria os pets fake, amarrados aos customers de `FAKE_USER_ROSTER` pelo email
 * fixo. Só chamado quando `SEED_FAKE_DATA=true` (gate em `runSeed`, **depois**
 * de `seedFakeUsers` — os donos precisam existir); esta função é incondicional
 * para ficar testável sem depender da env var.
 *
 * Idempotente por `(customerId, name)`: pet já existente — ativo, falecido ou
 * soft-deletado — é pulado.
 *
 * `withImages: false` existe para os testes (9.11/AB17), pelo mesmo motivo do
 * seed de catálogo: cada foto são dois encodes de `sharp`.
 */
export async function seedFakePets(
  options: { withImages?: boolean } = {},
): Promise<SeedFakePetsResult> {
  const withImages = options.withImages ?? true;

  const result: SeedFakePetsResult = {
    createdCount: 0,
    skippedCount: 0,
    photosStored: 0,
  };

  for (const definition of FAKE_PET_ROSTER) {
    const email = fakePetOwnerEmail(definition);
    const owner = await findAnyOwnerCustomer(email);

    if (owner === null) {
      throw new Error(
        `Pet "${definition.name}" aponta para o dono "${email}", que não tem perfil de customer — rode seedFakeUsers antes`,
      );
    }

    if (await findAnyPet(owner.id, definition.name)) {
      result.skippedCount++;
      continue;
    }

    const breedId = await resolveBreedId(definition);

    // Pelo repositório, não pelo service: o service exige ator autorizado e
    // gravaria linha de audit por pet. Mesmo corte de `seedFakeUsers`.
    const pet = await petRepository.createPet({
      ...toPetInput(definition, breedId),
      customerId: owner.id,
    });

    result.createdCount++;

    // Antes de qualquer estado terminal: gravar foto num pet já morto
    // funcionaria, mas deixaria a ordem do seed dependendo de um detalhe do
    // `applyUpdate` (que filtra `deletedAt: null`).
    if (withImages && definition.photo !== null) {
      const photoPath = await storeImage({
        owner: "pets",
        ownerId: pet.id,
        buffer: fakeImageBuffer(definition.photo),
      });

      await petRepository.setPetPhotoPath(pet.id, photoPath);
      result.photosStored++;
    }

    if (definition.trait === "DECEASED") {
      if (definition.deceasedAt === undefined) {
        throw new Error(
          `Pet "${definition.name}" tem trait DECEASED sem \`deceasedAt\` — a data é declarada para o seed ser determinístico`,
        );
      }

      await petRepository.setPetDeceasedAt(
        pet.id,
        new Date(definition.deceasedAt),
      );
    }

    if (definition.trait === "SOFT_DELETED") {
      await prisma.pet.update({
        where: { id: pet.id },
        data: { deletedAt: new Date() },
      });
    }

    // Dono morto, filho morto: o pet **herda o `deletedAt` do dono**, e não um
    // `new Date()` próprio. A correlação de timestamp é o que a restauração da
    // Fase 8 usa para decidir o que ressuscita junto com o perfil — um
    // timestamp inventado aqui deixaria o pet órfão da própria cascata.
    if (owner.deletedAt !== null) {
      await prisma.pet.update({
        where: { id: pet.id },
        data: { deletedAt: owner.deletedAt },
      });
    }
  }

  return result;
}
