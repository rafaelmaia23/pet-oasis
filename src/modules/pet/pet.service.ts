import {
  createForbiddenError,
  createNotFoundError,
  createValidationError,
} from "@/errors";
import type { PetSpecies } from "@/generated/prisma/enums";
import { type AuthUser, hasFeature } from "@/lib/authorization";
import { buildOffsetArgs, buildOrderBy } from "@/lib/pagination";
import { SPECIES_WITH_BREED } from "@/modules/breed/breed.constants";
import { findBreedById } from "@/modules/breed/breed.repository";
import { findActiveCustomerById } from "@/modules/user/profile/user.profile.repository";
import * as petRepository from "./pet.repository";
import {
  type CreatePetInput,
  type ListPetsQuery,
  PET_SORT,
  type UpdatePetInput,
} from "./pet.schema";

/**
 * Autorização de escopo (`own` × `:others`) em duas etapas, no idioma da 8.3.
 *
 * A primeira etapa já correu no `canAccess` da rota (forma frouxa: admite dono
 * e privilegiado indistintamente). Aqui roda a segunda — e ela **precisa** do
 * banco, porque o dono de um pet não está na URL: `/customers/:customerId` traz
 * o id do *perfil*, não o do usuário.
 *
 * Por isso a ordem canônica do projeto ("autorizar antes de buscar") não se
 * aplica literalmente, e o que a preserva em espírito é o alvo inexistente
 * **falhar fechado**: sem `:others`, qualquer alvo que não seja o próprio é
 * 403, inclusive o que não existe. Do contrário a rota viraria oráculo de
 * existência de `customerId` para qualquer cliente logado.
 */
function assertScope(
  actor: AuthUser,
  feature: "read:pet" | "manage:pet",
  ownerUserId: string | undefined,
) {
  if (hasFeature(actor, `${feature}:others`)) return;

  if (ownerUserId === actor.id) return;

  throw createForbiddenError({
    message: "Você não tem permissão para acessar este recurso",
    action: `Verifique se você tem acesso a feature "${feature}:others"`,
  });
}

async function resolveCustomer(
  actor: AuthUser,
  customerId: string,
  feature: "read:pet" | "manage:pet",
) {
  const customer = await findActiveCustomerById(customerId);

  assertScope(actor, feature, customer?.userId);

  if (!customer) {
    throw createNotFoundError({
      message: "Cliente não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return customer;
}

async function resolvePet(
  actor: AuthUser,
  petId: string,
  feature: "read:pet" | "manage:pet",
) {
  const pet = await petRepository.findPetById(petId);

  assertScope(actor, feature, pet?.customer.userId);

  if (!pet) {
    throw createNotFoundError({
      message: "Pet não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return pet;
}

/**
 * As três regras de espécie×raça do `docs/adr/pet-domain-modeling.md`. São
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

export async function createPet(
  actor: AuthUser,
  customerId: string,
  input: CreatePetInput,
) {
  const customer = await resolveCustomer(actor, customerId, "manage:pet");

  await assertSpeciesAndBreedAgree(input.species, input.breedId);

  return petRepository.createPet(
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
}

export async function getCustomerPets(actor: AuthUser, customerId: string) {
  const customer = await resolveCustomer(actor, customerId, "read:pet");

  return petRepository.findPetsByCustomerId(customer.id);
}

/**
 * Listagem geral de balcão. **Sem `assertScope` e sem ator**: a rota já exige
 * `read:pet:others` na forma privilegiada — listar pet de terceiro é a definição
 * dela, não um ramo a separar aqui. Mesmo desenho de `userService.getAllUsers`.
 */
export async function getAllPets(query: ListPetsQuery) {
  const { skip, take } = buildOffsetArgs(query);

  // O campo de ordenação sai da allowlist do recurso, nunca cru do query param.
  const orderBy = buildOrderBy(query, PET_SORT);

  return petRepository.findAllPets(
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
}

export async function getPetById(actor: AuthUser, petId: string) {
  return resolvePet(actor, petId, "read:pet");
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

  return petRepository.updatePet(pet.id, input, {
    action: "PET_UPDATED",
    targetType: "Pet",
    targetId: pet.id,
    metadata: {
      customerId: pet.customerId,
      fieldsChanged: Object.keys(input),
    },
  });
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
