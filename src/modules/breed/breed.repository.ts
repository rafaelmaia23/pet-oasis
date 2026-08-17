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
