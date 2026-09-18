import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { UpdateCategoryInput } from "./category.schema";

/**
 * Única camada que toca o Prisma no módulo. Toda leitura filtra
 * `deletedAt: null` — por isso `findFirst`, nunca `findUnique`.
 */

export async function findCategoryById(id: string) {
  return prisma.category.findFirst({ where: { id, deletedAt: null } });
}

/**
 * Todas as categorias ativas, plano. Serve tanto a montagem da árvore quanto as
 * validações do service, que precisam do grafo inteiro para medir profundidade
 * e detectar ciclo — uma leitura por escrita, em vez de uma query por nível.
 */
export async function findAllCategories() {
  return prisma.category.findMany({
    where: { deletedAt: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

export async function countActiveChildren(parentId: string) {
  return prisma.category.count({ where: { parentId, deletedAt: null } });
}

/**
 * Quais dos ids informados existem e estão ativos — o produto (9.7) valida a
 * lista inteira com uma query, e nomeia no 422 os que sobraram.
 */
export async function findActiveCategoryIds(ids: string[]) {
  const categories = await prisma.category.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });

  return categories.map((category) => category.id);
}

/**
 * Produtos **ativos** vinculados à categoria (9.6/W3, metade que faltava): é o
 * que transforma a exclusão em 409. Categoria cujos produtos foram todos
 * excluídos volta a ser excluível — o vínculo morto não guarda nada.
 */
export async function countActiveProducts(categoryId: string) {
  return prisma.productCategory.count({
    where: { categoryId, product: { deletedAt: null } },
  });
}

export async function createCategory(
  data: Prisma.CategoryUncheckedCreateInput,
  audit?: AuditDescriptor,
) {
  const args = { data };

  if (!audit) return prisma.category.create(args);

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.create(args);

    await record({ ...audit, targetId: category.id }, tx);

    return category;
  });
}

async function applyUpdate(
  id: string,
  data: Prisma.CategoryUncheckedUpdateInput,
  audit?: AuditDescriptor,
) {
  const args = { where: { id, deletedAt: null }, data };

  if (!audit) return prisma.category.update(args);

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.update(args);

    await record(audit, tx);

    return category;
  });
}

export async function updateCategory(
  id: string,
  data: UpdateCategoryInput,
  audit?: AuditDescriptor,
) {
  return applyUpdate(id, definedOnly(data), audit);
}

export async function softDeleteCategory(id: string, audit?: AuditDescriptor) {
  return applyUpdate(id, { deletedAt: new Date() }, audit);
}
