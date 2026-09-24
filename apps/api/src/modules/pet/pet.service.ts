import {
  type CreatePetInput,
  type ListPetsQuery,
  PET_SORT,
  type UpdatePetInput,
} from "@pet-oasis/api-contracts/pet";
import { createValidationError } from "@/errors";
import type { PetSpecies } from "@/generated/prisma/enums";
import { type AuthUser, authorizeThenLoad } from "@/lib/authorization";
import { buildOffsetArgs, buildOrderBy } from "@/lib/pagination";
import { deleteImage, imageUrls, storeImage } from "@/lib/storage";
import { SPECIES_WITH_BREED } from "@/modules/breed/breed.constants";
import { findBreedById } from "@/modules/breed/breed.repository";
import { findActiveCustomerById } from "@/modules/user/profile/user.profile.repository";
import * as petRepository from "./pet.repository";

/** As duas features de pet que têm par self/`:others`. */
type PetFeature = "read:pet" | "manage:pet";

/**
 * Autorização de escopo (`own` × `:others`) em duas etapas, no idioma da 8.3.
 *
 * A primeira etapa já correu no `canAccess` da rota (forma frouxa: admite dono
 * e privilegiado indistintamente). Aqui roda a segunda — e ela **precisa** do
 * banco, porque o dono de um pet não está na URL: `/customers/:customerId` traz
 * o id do *perfil*, não o do usuário.
 *
 * É exatamente o modo `fail-closed` de `authorizeThenLoad`: a ordem canônica do
 * projeto ("autorizar antes de buscar") não se aplica literalmente, e o que a
 * preserva em espírito é o alvo inexistente **falhar fechado** — sem `:others`,
 * qualquer alvo que não seja o próprio é 403, inclusive o que não existe. Do
 * contrário a rota viraria oráculo de existência de `customerId` para qualquer
 * cliente logado.
 */
const resolveCustomer = (
  actor: AuthUser,
  customerId: string,
  feature: PetFeature,
) =>
  authorizeThenLoad({
    actor,
    feature,
    mode: "fail-closed",
    ownerOf: (customer) => customer.userId,
    load: () => findActiveCustomerById(customerId),
    notFound: {
      message: "Cliente não encontrado",
      action: "Verifique o ID e tente novamente",
    },
  });

const resolvePet = (actor: AuthUser, petId: string, feature: PetFeature) =>
  authorizeThenLoad({
    actor,
    feature,
    mode: "fail-closed",
    ownerOf: (pet) => pet.customer.userId,
    load: () => petRepository.findPetById(petId),
    notFound: {
      message: "Pet não encontrado",
      action: "Verifique o ID e tente novamente",
    },
  });

/**
 * As três regras de espécie×raça do `docs/adr/0006-pet-domain-modeling.md`. São
 * semânticas (a última consulta o banco), então vivem aqui e não no Zod.
 *
 * Quem decide "esta espécie exige raça?" é `SPECIES_WITH_BREED`, constante
 * explícita — e não "existe linha em `Breed` para esta espécie", que faria pet
 * já cadastrado violar a regra retroativamente no dia em que alguém semeasse a
 * primeira raça de peixe.
 */
async function assertSpeciesAndBreedAgree(
  species: PetSpecies,
  breedId: string | null | undefined,
) {
  // `.some` e não `.includes`: o array é `readonly ["DOG", "CAT"]`, e
  // `includes` exigiria um `as` para aceitar um `PetSpecies` qualquer.
  const requiresBreed = SPECIES_WITH_BREED.some(
    (withBreed) => withBreed === species,
  );

  if (requiresBreed && !breedId) {
    throw createValidationError({
      errors: {
        breedId: [`A espécie ${species} exige que a raça seja informada`],
      },
    });
  }

  if (!requiresBreed && breedId) {
    throw createValidationError({
      errors: {
        breedId: [`A espécie ${species} não tem raça cadastrada`],
      },
    });
  }

  if (!breedId) return;

  const breed = await findBreedById(breedId);

  if (!breed) {
    throw createValidationError({
      errors: { breedId: ["Raça não encontrada"] },
    });
  }

  if (breed.species !== species) {
    throw createValidationError({
      errors: {
        breedId: [`A raça ${breed.name} não pertence à espécie ${species}`],
      },
    });
  }
}

/**
 * Troca a chave gravada pelas duas URLs públicas antes de a ficha sair. Fica
 * neste ponto — e não no presenter — pelo mesmo motivo de `inStock` no produto:
 * toda resposta de pet passa por aqui, então é o único lugar onde a derivação
 * precisa existir.
 */
function withPhoto<P extends { photoPath: string | null }>(pet: P) {
  const { photoPath, ...rest } = pet;

  return {
    ...rest,
    photo: photoPath === null ? null : imageUrls(photoPath),
  };
}

export async function createPet(
  actor: AuthUser,
  customerId: string,
  input: CreatePetInput,
) {
  const customer = await resolveCustomer(actor, customerId, "manage:pet");

  await assertSpeciesAndBreedAgree(input.species, input.breedId);

  const pet = await petRepository.createPet(
    { ...input, customerId: customer.id },

    {
      action: "PET_CREATED",
      targetType: "Pet",
      metadata: {
        customerId: customer.id,
        species: input.species,
        // Quem cadastrou: o próprio dono, ou o balcão em nome dele.
        source: customer.userId === actor.id ? "SELF" : "STAFF",
      },
    },
  );

  return withPhoto(pet);
}

export async function getCustomerPets(actor: AuthUser, customerId: string) {
  const customer = await resolveCustomer(actor, customerId, "read:pet");

  const pets = await petRepository.findPetsByCustomerId(customer.id);

  return pets.map(withPhoto);
}

/**
 * Listagem geral de balcão. **Sem escopo e sem ator**: a rota já exige
 * `read:pet:others` na forma privilegiada — listar pet de terceiro é a definição
 * dela, não um ramo a separar aqui. Mesmo desenho de `userService.getAllUsers`.
 */
export async function getAllPets(query: ListPetsQuery) {
  const { skip, take } = buildOffsetArgs(query);

  // O campo de ordenação sai da allowlist do recurso, nunca cru do query param.
  const orderBy = buildOrderBy(query, PET_SORT);

  const { pets, total } = await petRepository.findAllPets(
    {
      species: query.species,
      sex: query.sex,
      customerId: query.customerId,
      breedId: query.breedId,
      microchipId: query.microchipId,
      neutered: query.neutered,
      deceased: query.deceased,
    },
    { skip, take, orderBy },
  );

  return { pets: pets.map(withPhoto), total };
}

export async function getPetById(actor: AuthUser, petId: string) {
  return withPhoto(await resolvePet(actor, petId, "read:pet"));
}

export async function updatePet(
  actor: AuthUser,
  petId: string,
  input: UpdatePetInput,
) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  // A espécie é editável (erro de cadastro é caso real), então a validação
  // corre sobre o estado **resultante**, não sobre o corpo isolado: trocar a
  // espécie sem ajustar a raça no mesmo PATCH tem de ser recusado.
  const species = input.species ?? pet.species;
  const breedId = "breedId" in input ? input.breedId : pet.breedId;

  await assertSpeciesAndBreedAgree(species, breedId);

  const updated = await petRepository.updatePet(pet.id, input, {
    action: "PET_UPDATED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: {
      customerId: pet.customerId,
      fieldsChanged: Object.keys(input),
    },
  });

  return withPhoto(updated);
}

/**
 * Foto é valor **único** num endereço fixo, então `PUT` substitui (9.10/AA7):
 * trocar a foto é um gesto só, e exigir `DELETE` antes seria atrito sem ganho.
 * O arquivo anterior é apagado depois de a coluna já apontar para o novo —
 * quebrar no meio deixa órfão no disco, nunca ficha apontando para o nada.
 */
export async function setPetPhoto(
  actor: AuthUser,
  petId: string,
  buffer: Buffer,
) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  const photoPath = await storeImage({
    owner: "pets",
    ownerId: pet.id,
    buffer,
  });

  const updated = await petRepository.setPetPhotoPath(pet.id, photoPath, {
    action: "PET_PHOTO_UPDATED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: { customerId: pet.customerId },
  });

  if (pet.photoPath) await deleteImage(pet.photoPath);

  return withPhoto(updated);
}

/** Idempotente: pet sem foto já está no estado desejado, então 204 e não 404. */
export async function removePetPhoto(actor: AuthUser, petId: string) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  if (!pet.photoPath) return;

  await petRepository.setPetPhotoPath(pet.id, null, {
    action: "PET_PHOTO_DELETED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: { customerId: pet.customerId },
  });

  await deleteImage(pet.photoPath);
}

export async function deletePet(actor: AuthUser, petId: string) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  await petRepository.softDeletePet(pet.id, {
    action: "PET_DELETED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: { customerId: pet.customerId },
  });
}

/**
 * Falecimento é estado, não exclusão (`deceasedAt` ≠ `deletedAt`): o pet
 * continua na lista do dono. Idempotente — remarcar não reescreve a data já
 * registrada, senão um clique repetido apagaria a informação verdadeira.
 */
export async function markPetDeceased(actor: AuthUser, petId: string) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  if (pet.deceasedAt) return;

  await petRepository.setPetDeceasedAt(pet.id, new Date(), {
    action: "PET_DECEASED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: { customerId: pet.customerId },
  });
}

/** Desfaz o registro (marcação no pet errado). Sem audit próprio: a correção
 * de um dado é um `PET_UPDATED` comum. */
export async function unmarkPetDeceased(actor: AuthUser, petId: string) {
  const pet = await resolvePet(actor, petId, "manage:pet");

  if (!pet.deceasedAt) return;

  await petRepository.setPetDeceasedAt(pet.id, null, {
    action: "PET_UPDATED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: { customerId: pet.customerId, fieldsChanged: ["deceasedAt"] },
  });
}
