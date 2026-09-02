import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";

/**
 * Única camada que toca o Prisma nas imagens do produto. Sem filtro de
 * `deletedAt`: `ProductImage` é a única tabela de domínio sem soft delete
 * (9.10/AA16) — a linha existe enquanto o byte existe.
 */

export async function findImagesOfProduct(productId: string) {
  return prisma.productImage.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function findImageById(id: string) {
  return prisma.productImage.findUnique({ where: { id } });
}

export async function countImagesOfProduct(productId: string) {
  return prisma.productImage.count({ where: { productId } });
}

export async function createImage(
  data: { productId: string; path: string; position: number },
  audit: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const image = await tx.productImage.create({ data });

    await record(
      { ...audit, metadata: { ...audit.metadata, imageId: image.id } },
      tx,
    );

    return image;
  });
}

/**
 * Hard delete (AA16), e a linha some junto com o arquivo. Quem apaga o byte é o
 * service, **depois** de a linha sair: se a ordem fosse a inversa e a
 * transação falhasse, sobraria linha apontando para o nada — o descasamento
 * que o ADR classifica como mais grave que um órfão no disco.
 */
export async function deleteImage(id: string, audit: AuditDescriptor) {
  return prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id } });

    await record(audit, tx);
  });
}

/**
 * Reescreve o bloco inteiro de posições numa transação só. É por isso que
 * `position` não tem `@@unique([productId, position])`: numa permuta, o estado
 * intermediário violaria o unique a cada `update`, e a saída seria inventar
 * posições temporárias.
 */
export async function reorderImages(
  productId: string,
  orderedIds: string[],
  audit: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    for (const [position, id] of orderedIds.entries()) {
      await tx.productImage.update({
        where: { id, productId },
        data: { position },
      });
    }

    await record(audit, tx);

    return tx.productImage.findMany({
      where: { productId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  });
}
