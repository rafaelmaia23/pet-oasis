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
 * Exclusão da variante, sob lock da linha do produto, devolvendo `null` quando
 * a que sai é a **última ativa**.
 *
 * A contagem das irmãs e a exclusão são duas idas ao banco: soltas, dois
 * `DELETE` simultâneos no mesmo produto contam `1` cada um antes de qualquer
 * commit e passam os dois — produto ativo com zero variantes, que é o que a X6
 * proíbe. `SELECT ... FOR UPDATE` no produto serializa os concorrentes
 * **daquele** produto, no mesmo remédio que a 9.10 usou nas imagens (terceiro e
 * último ponto de SQL cru do projeto).
 *
 * A promoção da default (X5) mora aqui pelo mesmo motivo: eleger a substituta
 * fora da transação seria ler um estado que o lock existe para congelar. O
 * `null` é deliberado — quem conhece a regra ("a última não sai, e isso é 409")
 * é o service; o repository só sabe que não deu.
 */
export async function softDeleteVariantIfNotLast(
  variant: { id: string; productId: string; isDefault: boolean },
  audit: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    // Template parametrizado, nunca concatenação, e sem cast: `products.id` é
    // TEXT no Postgres, então `= $1::uuid` estouraria.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${variant.productId} FOR UPDATE`;

    const siblings = {
      productId: variant.productId,
      deletedAt: null,
      id: { not: variant.id },
    };

    if ((await tx.productVariant.count({ where: siblings })) === 0) return null;

    const promoted = variant.isDefault
      ? await tx.productVariant.findFirst({
          where: siblings,
          orderBy: { createdAt: "asc" },
        })
      : null;

    const deleted = await tx.productVariant.update({
      where: { id: variant.id, deletedAt: null },
      data: { deletedAt: new Date(), isDefault: false },
    });

    if (promoted) {
      await tx.productVariant.update({
        where: { id: promoted.id },
        data: { isDefault: true },
      });
    }

    await record(
      {
        ...audit,
        metadata: {
          ...audit.metadata,
          ...(promoted ? { promotedVariantId: promoted.id } : {}),
        },
      },
      tx,
    );

    return deleted;
  });
}
