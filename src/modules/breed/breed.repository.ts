import type { PetSpecies } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

// Sem filtro de `deletedAt`: `Breed` é catálogo de referência e não tem soft
// delete (a coluna não existe no schema).
export async function getBreeds(species?: PetSpecies) {
  return prisma.breed.findMany({
    where: species ? { species } : {},
    // Determinística e estável — o `name` é único dentro da espécie, então o
    // par já desempata sozinho, sem precisar do tiebreaker por `id`.
    orderBy: [{ species: "asc" }, { name: "asc" }],
  });
}

/**
 * Consumida pelo `pet.service` (9.4) para a validação semântica de raça: é
 * preciso saber a **espécie** da raça informada para recusar "Golden Retriever
 * num gato". `findUnique` porque `Breed` não tem soft delete.
 */
export async function findBreedById(id: string) {
  return prisma.breed.findUnique({ where: { id } });
}
