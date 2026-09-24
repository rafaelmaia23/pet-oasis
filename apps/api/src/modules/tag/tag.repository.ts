import type { UpdateTagInput } from "@pet-oasis/api-contracts/catalog";
import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, writeAudited } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";

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
  audit: AuditDescriptor,
) {
  return writeAudited(
    (tag: { id: string }) => ({ ...audit, targetId: tag.id }),
    (tx) => tx.tag.create({ data }),
  );
}

export async function updateTag(
  id: string,
  data: UpdateTagInput,
  audit: AuditDescriptor,
) {
  return writeAudited(audit, (tx) =>
    tx.tag.update({ where: { id }, data: definedOnly(data) }),
  );
}

/**
 * Hard delete (9.6/W5). O audit grava na mesma transação e é o único registro
 * de que a tag existiu.
 */
export async function deleteTag(id: string, audit: AuditDescriptor) {
  await writeAudited(audit, (tx) => tx.tag.delete({ where: { id } }));
}
