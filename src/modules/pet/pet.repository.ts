import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { CreatePetInput, UpdatePetInput } from "./pet.schema";

/**
 * Única camada que toca o Prisma no módulo. Toda leitura filtra
 * `deletedAt: null` (por isso `findFirst`, nunca `findUnique`) — mas **não**
 * filtra `deceasedAt`: falecido não é excluído, continua na lista do dono.
 */

/**
 * `customer.userId` vem junto porque é ele — e não `customerId` — que o service
 * compara com o ator para decidir `own` × `:others`.
 */
const petInclude = {
  breed: true,
  customer: { select: { userId: true } },
} as const;

export async function findPetById(id: string) {
  return prisma.pet.findFirst({
    where: { id, deletedAt: null },
    include: petInclude,
  });
}

export async function findPetsByCustomerId(customerId: string) {
  return prisma.pet.findMany({
    where: { customerId, deletedAt: null },
    include: petInclude,
    // Sem paginação (mesma classe de `GET /users/:userId/roles`): a coleção é
    // limitada pelo dono. Quem pagina é o `GET /pets` da 9.5. O tiebreaker por
    // `id` mantém a ordem total mesmo com dois pets cadastrados no mesmo ms.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function createPet(
  data: CreatePetInput & { customerId: string },
  audit?: AuditDescriptor,
) {
  // Os obrigatórios saem nomeados para continuarem obrigatórios; o resto passa
  // pelo `definedOnly`, que é o que reconcilia o opcional do Zod com o do
  // Prisma sob `exactOptionalPropertyTypes`.
  const { customerId, name, species, ...optional } = data;

  const args = {
    data: { customerId, name, species, ...definedOnly(optional) },
    include: petInclude,
  };

  if (!audit) return prisma.pet.create(args);

  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.create(args);

    await record({ ...audit, targetId: pet.id }, tx);

    return pet;
  });
}

async function applyUpdate(
  id: string,
  data: Prisma.PetUncheckedUpdateInput,
  audit?: AuditDescriptor,
) {
  const args = { where: { id, deletedAt: null }, data, include: petInclude };

  if (!audit) return prisma.pet.update(args);

  return prisma.$transaction(async (tx) => {
    const pet = await tx.pet.update(args);

    await record(audit, tx);

    return pet;
  });
}

export async function updatePet(
  id: string,
  data: UpdatePetInput,
  audit?: AuditDescriptor,
) {
  return applyUpdate(id, definedOnly(data), audit);
}

export async function softDeletePet(id: string, audit?: AuditDescriptor) {
  return applyUpdate(id, { deletedAt: new Date() }, audit);
}

/** `null` desfaz o registro de falecimento (marcação no pet errado). */
export async function setPetDeceasedAt(
  id: string,
  deceasedAt: Date | null,
  audit?: AuditDescriptor,
) {
  return applyUpdate(id, { deceasedAt }, audit);
}
