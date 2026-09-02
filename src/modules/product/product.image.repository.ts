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

/**
 * Cria a imagem **no fim da fila**, sob lock da linha do produto, e devolve
 * `null` quando o produto já tem `maxImages`.
 *
 * O lock existe por causa do desenho que a própria API recomenda (AA4): o
 * cliente que deixa o usuário escolher oito fotos dispara **oito requests em
 * paralelo**. Sem ele, os oito leem a contagem antes de qualquer insert
 * commitar — todos gravam `position: 0` e o teto de 8 é ultrapassado por
 * quantos couberem na janela. `SELECT ... FOR UPDATE` no produto serializa os
 * concorrentes **daquele produto** (produtos diferentes seguem em paralelo).
 *
 * O `null` é deliberado: quem conhece a regra ("8 é o teto, estourar é 422") é
 * o service. O repository só sabe contar e só sabe dizer que não coube.
 */
export async function createImageAtEnd(
  productId: string,
  path: string,
  maxImages: number,
  audit: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    // Template parametrizado, nunca concatenação. É o segundo ponto de SQL cru
    // do projeto (o primeiro é `product.search.repository.ts`), e pelo mesmo
    // motivo: o Prisma não expressa o que se precisa aqui — não há como pedir
    // um lock de linha pela API dele sem escrever numa coluna só para isso.
    // Sem cast: `products.id` é TEXT no Postgres (o Prisma mapeia `String`
    // assim, mesmo com `@default(uuid())`), e `= $1::uuid` estouraria.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;

    const position = await tx.productImage.count({ where: { productId } });

    if (position >= maxImages) return null;

    const image = await tx.productImage.create({
      data: { productId, path, position },
    });

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
