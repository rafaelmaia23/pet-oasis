import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { UpdateTagInput } from "./tag.schema";

/**
 * Única camada que toca o Prisma no módulo. Diferente de marca e categoria, aqui
 * **não** há filtro de `deletedAt` em lugar nenhum: a coluna não existe, porque
 * o DELETE de tag é hard (9.6/W5). Por isso as leituras usam `findUnique`.
 */

export async function findTagById(id: string) {
  return prisma.tag.findUnique({ where: { id } });
}

export async function findAllTags() {
  return prisma.tag.findMany({ orderBy: { name: "asc" } });
}

/**
 * Quais dos ids informados existem — o produto (9.7) valida a lista inteira com
 * uma query, e nomeia no 422 os que sobraram.
 */
export async function findExistingTagIds(ids: string[]) {
  const tags = await prisma.tag.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });

  return tags.map((tag) => tag.id);
}

export async function createTag(
  data: Prisma.TagUncheckedCreateInput,
  audit?: AuditDescriptor,
) {
  const args = { data };

  if (!audit) return prisma.tag.create(args);

  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.create(args);

    await record({ ...audit, targetId: tag.id }, tx);

    return tag;
  });
}

export async function updateTag(
  id: string,
  data: UpdateTagInput,
  audit?: AuditDescriptor,
) {
  const args = { where: { id }, data: definedOnly(data) };

  if (!audit) return prisma.tag.update(args);

  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.update(args);

    await record(audit, tx);

    return tag;
  });
}

/**
 * Hard delete (9.6/W5). O audit grava na mesma transação e é o **único** registro
 * de que a tag existiu — daí ele não ser opcional aqui como nos outros deletes.
 */
export async function deleteTag(id: string, audit: AuditDescriptor) {
  return prisma.$transaction(async (tx) => {
    await tx.tag.delete({ where: { id } });

    await record(audit, tx);
  });
}
