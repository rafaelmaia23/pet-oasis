import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { UpdateVariantInput } from "./product.variant.schema";

/**
 * Única camada que toca o Prisma nas variantes. Toda leitura filtra
 * `deletedAt: null`; como o produto cascateia na exclusão (X8), variante ativa
 * implica produto ativo, e não é preciso subir a relação para conferir.
 *
 * A promoção/rebaixamento da default acontece **dentro** da mesma transação da
 * escrita (X5): fora dela existiria um instante com duas defaults, ou nenhuma.
 */

export async function findVariantById(id: string) {
  return prisma.productVariant.findFirst({ where: { id, deletedAt: null } });
}

export async function countActiveSiblings(productId: string, exceptId: string) {
  return prisma.productVariant.count({
    where: { productId, deletedAt: null, id: { not: exceptId } },
  });
}

/** A mais antiga entre as ativas — a que herda a default de quem saiu. */
export async function findOldestActiveSibling(
  productId: string,
  exceptId: string,
) {
  return prisma.productVariant.findFirst({
    where: { productId, deletedAt: null, id: { not: exceptId } },
    orderBy: { createdAt: "asc" },
  });
}

async function demoteOthers(
  tx: Prisma.TransactionClient,
  productId: string,
  exceptId: string,
) {
  await tx.productVariant.updateMany({
    where: {
      productId,
      deletedAt: null,
      id: { not: exceptId },
      isDefault: true,
    },
    data: { isDefault: false },
  });
}

export async function createVariant(
  data: Omit<Prisma.ProductVariantUncheckedCreateInput, "id">,
  audits: AuditDescriptor[] = [],
) {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({ data });

    if (data.isDefault) await demoteOthers(tx, variant.productId, variant.id);

    for (const audit of audits) {
      await record({ ...audit, targetId: variant.id }, tx);
    }

    return variant;
  });
}

export async function updateVariant(
  id: string,
  data: UpdateVariantInput,
  audits: AuditDescriptor[] = [],
) {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.update({
      where: { id, deletedAt: null },
      data: definedOnly(data),
    });

    if (data.isDefault) await demoteOthers(tx, variant.productId, variant.id);

    for (const audit of audits) await record(audit, tx);

    return variant;
  });
}

/**
 * Exclusão da variante. `promoteId` vem preenchido quando a que sai era a
 * default: o produto não pode ficar sem uma (X5), e quem elege a substituta é o
 * service — aqui só se garante que as duas escritas caiam juntas.
 */
export async function softDeleteVariant(
  id: string,
  promoteId: string | null,
  audits: AuditDescriptor[] = [],
) {
  return prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.update({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });

    if (promoteId) {
      await tx.productVariant.update({
        where: { id: promoteId },
        data: { isDefault: true },
      });
    }

    for (const audit of audits) await record(audit, tx);

    return variant;
  });
}
