import type { prisma } from "@/lib/prisma";
import { DEFAULT_BREEDS } from "@/modules/breed/breed.constants";

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Semeia o catálogo de raças (9.3). Como features e roles, é dado de
 * **referência**: roda sempre, sem flag de env.
 *
 * Idempotente pela chave `@@unique([species, name])` via `skipDuplicates`, e
 * não por `upsert` em laço como as roles: `Breed` não tem **nenhum** campo
 * mutável — `species` e `name` *são* a chave, então não existe o que atualizar
 * numa linha que já está lá. Uma ida ao banco em vez de ~140.
 *
 * Deliberadamente **sem delete reconciliador** (o `deleteMany({ notIn })` que
 * `runSeed` aplica às features): a partir da 9.4 `Pet.breedId` referencia estas
 * linhas, e apagar uma raça que ainda tem pet quebraria o seed no boot do
 * container — que roda `migrate deploy → seed → start` a cada restart. Tirar
 * uma raça do catálogo é migration deliberada, nunca efeito colateral do seed.
 *
 * Sem código de nível de módulo que se auto-execute, pela mesma razão
 * documentada em `src/lib/seedDatabase.ts`.
 *
 * @returns quantas raças foram efetivamente criadas (0 numa re-execução).
 */
export async function seedBreeds(tx: Tx): Promise<number> {
  const { count } = await tx.breed.createMany({
    data: [...DEFAULT_BREEDS],
    skipDuplicates: true,
  });

  return count;
}
