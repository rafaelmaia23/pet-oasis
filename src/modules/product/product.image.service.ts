import { createNotFoundError, createValidationError } from "@/errors";
import {
  deleteImage as deleteFile,
  imageUrls,
  storeImage,
} from "@/lib/storage";
import { MAX_IMAGES_PER_PRODUCT } from "./product.image.constants";
import * as imageRepository from "./product.image.repository";
import { resolveProduct } from "./product.service";

/**
 * Regras de imagem de produto. O escopo aqui é o de todo o catálogo — dado da
 * loja, não de um dono —, então a rota já resolve a autorização com
 * `manage:product` e o que sobra é o teto, a posição e a ordem de escrita entre
 * disco e banco.
 */

type PresentedImage = { id: string; position: number };

function present<T extends PresentedImage & { path: string }>(image: T) {
  return {
    id: image.id,
    position: image.position,
    ...imageUrls(image.path),
  };
}

/**
 * O 404 de imagem que existe mas é de **outro** produto (AA11). A rota é
 * aninhada, então `/products/A/images/X` com `X` de B é um recurso que de fato
 * não existe — e responder 404 (em vez de 422 nomeando o descasamento) é o que
 * impede a rota de virar oráculo: um id certo com dono errado fica
 * indistinguível de um id inventado.
 */
async function resolveImage(productId: string, imageId: string) {
  const image = await imageRepository.findImageById(imageId);

  if (!image || image.productId !== productId) {
    throw createNotFoundError({
      message: "Imagem não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return image;
}

/**
 * Ordem de escrita: **disco antes da linha**, e a linha que falha manda apagar
 * o arquivo. O disco não participa da transação do Postgres, então não há como
 * fazer os dois atomicamente — o que se escolhe é qual lado fica órfão quando
 * quebra no meio. Arquivo sem linha só ocupa disco (e a varredura o encontra);
 * linha sem arquivo é imagem quebrada na vitrine.
 */
export async function addImage(productId: string, buffer: Buffer) {
  await resolveProduct(productId);

  const existing = await imageRepository.countImagesOfProduct(productId);

  if (existing >= MAX_IMAGES_PER_PRODUCT) {
    throw createValidationError({
      errors: {
        file: [
          `Este produto já tem o máximo de ${MAX_IMAGES_PER_PRODUCT} imagens`,
        ],
      },
    });
  }

  const path = await storeImage({
    owner: "products",
    ownerId: productId,
    buffer,
  });

  try {
    const image = await imageRepository.createImage(
      { productId, path, position: existing },
      {
        action: "PRODUCT_IMAGE_UPLOADED",
        targetType: "Product",
        targetId: productId,
      },
    );

    return present(image);
  } catch (error) {
    // Compensação: a linha não entrou, então o arquivo não deve ficar. É o que
    // mantém o órfão como exceção (falha da compensação também) em vez de
    // consequência normal de um erro de escrita.
    await deleteFile(path);
    throw error;
  }
}

/**
 * Apaga a linha e **depois** o arquivo. A ordem é a inversa da criação pelo
 * mesmo critério: se quebrar no meio, o que sobra é arquivo sem linha (órfão,
 * barato), nunca linha sem arquivo (imagem quebrada).
 *
 * As posições restantes são compactadas para que a sequência não ganhe buracos
 * — apagar a capa promove a seguinte, que é o que qualquer um espera ver.
 */
export async function removeImage(productId: string, imageId: string) {
  const image = await resolveImage(productId, imageId);

  await imageRepository.deleteImage(image.id, {
    action: "PRODUCT_IMAGE_DELETED",
    targetType: "Product",
    targetId: productId,
    metadata: { imageId: image.id },
  });

  await deleteFile(image.path);

  const remaining = await imageRepository.findImagesOfProduct(productId);

  if (remaining.some((row, index) => row.position !== index)) {
    await imageRepository.reorderImages(
      productId,
      remaining.map((row) => row.id),
      {
        action: "PRODUCT_IMAGES_REORDERED",
        targetType: "Product",
        targetId: productId,
        metadata: { reason: "COMPACTION" },
      },
    );
  }
}

/**
 * Reordenação por **array completo** (AA13): o corpo precisa ser exatamente o
 * conjunto de imagens do produto. É idempotente e não tem estado intermediário
 * inválido — o servidor nunca precisa consertar buracos nem empates de posição.
 *
 * Id de imagem de outro produto (ou inexistente) no array é **404**, pelo mesmo
 * motivo do item: o recurso nomeado não existe sob este produto.
 */
export async function reorderImages(productId: string, orderedIds: string[]) {
  await resolveProduct(productId);

  const current = await imageRepository.findImagesOfProduct(productId);
  const currentIds = new Set(current.map((image) => image.id));

  for (const id of orderedIds) {
    if (!currentIds.has(id)) {
      throw createNotFoundError({
        message: "Imagem não encontrada",
        action: "Verifique os IDs e tente novamente",
      });
    }
  }

  if (orderedIds.length !== current.length) {
    throw createValidationError({
      errors: {
        images: [
          `A ordem precisa conter todas as ${current.length} imagens do produto`,
        ],
      },
    });
  }

  const reordered = await imageRepository.reorderImages(productId, orderedIds, {
    action: "PRODUCT_IMAGES_REORDERED",
    targetType: "Product",
    targetId: productId,
    metadata: { count: orderedIds.length },
  });

  return reordered.map(present);
}
