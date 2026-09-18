import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createValidationError } from "@/errors";
import { storage } from "./storage";

/**
 * O degrau de domínio acima do `Storage`: valida, normaliza e nomeia. Toda
 * imagem do projeto entra por aqui — API e seed —, para que o arquivo que o
 * seed produz tenha exatamente a mesma forma do que a API produz.
 *
 * Duas garantias moram neste arquivo, e as duas são de **construção**:
 *
 * 1. `storeImage` não recebe nome de arquivo. Não há por onde o nome escolhido
 *    pelo usuário virar caminho no disco — o vetor clássico de path traversal
 *    em upload é fechado pela assinatura, não por sanitização.
 * 2. O formato é reconhecido pelos **magic bytes**, nunca pelo `Content-Type`
 *    nem pela extensão: os dois são texto que o cliente escreve.
 */

/**
 * Dimensão máxima do lado maior, por dono (AA6). Constante e não env var: "logo
 * de marca é menor que foto de vitrine" é regra de domínio, e regra em env é
 * regra que ninguém acha lendo o domínio.
 *
 * Marca fica com os dois tamanhos, e não com um só, porque o logo também
 * aparece pequeno (chip na lista) e maior (página da marca) — e um dono com
 * conjunto de tamanhos diferente forçaria `imageUrls` a ter um tipo por dono.
 */
export const IMAGE_DIMENSIONS = {
  products: { full: 1600, thumb: 400 },
  pets: { full: 800, thumb: 200 },
  brands: { full: 512, thumb: 128 },
} as const;

export type ImageOwner = keyof typeof IMAGE_DIMENSIONS;

export const IMAGE_SIZES = ["full", "thumb"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

/** Formatos aceitos na **entrada**. A saída é sempre WebP. */
export type ImageFormat = "jpeg" | "png" | "webp";

const SIGNATURES: { format: ImageFormat; test: (buffer: Buffer) => boolean }[] =
  [
    {
      format: "jpeg",
      test: (buffer) =>
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff,
    },
    {
      format: "png",
      test: (buffer) =>
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          ),
    },
    {
      // RIFF….WEBP — os quatro bytes do meio são o tamanho do arquivo.
      format: "webp",
      test: (buffer) =>
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP",
    },
  ];

/**
 * O formato real do buffer, ou `null` se não for nenhum dos aceitos.
 *
 * GIF e AVIF ficam de fora conscientemente (AA5): AVIF por custo de encode no
 * ARM64, e GIF porque converter animação em quadro único é o tipo de perda
 * silenciosa que é pior do que recusar o arquivo.
 */
export function detectImageFormat(buffer: Buffer): ImageFormat | null {
  return SIGNATURES.find((signature) => signature.test(buffer))?.format ?? null;
}

function fileOf(key: string, size: ImageSize): string {
  return `${key}-${size}.webp`;
}

/**
 * As duas URLs públicas de uma chave. O que está gravado no banco é a **chave
 * base** (`products/<id>/<uuid>`), que não é caminho de arquivo nem URL: os
 * dois derivados nascem dela por sufixo, então acrescentar um terceiro tamanho
 * amanhã é uma entrada em `IMAGE_DIMENSIONS`, nunca uma migration (AA9).
 */
export function imageUrls(key: string) {
  return {
    fullUrl: storage.url(fileOf(key, "full")),
    thumbUrl: storage.url(fileOf(key, "thumb")),
  };
}

/**
 * Valida, normaliza e grava os dois derivados. Devolve a **chave base** para
 * quem for guardá-la no banco.
 *
 * `.rotate()` sem argumento aplica a orientação do EXIF e o descarta em
 * seguida — é o que impede a foto de celular de sair deitada, e o que apaga a
 * geolocalização que vinha de brinde na foto do pet de alguém.
 */
export async function storeImage({
  owner,
  ownerId,
  buffer,
}: {
  owner: ImageOwner;
  ownerId: string;
  buffer: Buffer;
}): Promise<string> {
  if (!detectImageFormat(buffer)) {
    throw createValidationError({
      errors: {
        file: ["O arquivo precisa ser uma imagem JPEG, PNG ou WebP"],
      },
    });
  }

  const key = `${owner}/${ownerId}/${randomUUID()}`;
  const dimensions = IMAGE_DIMENSIONS[owner];

  for (const size of IMAGE_SIZES) {
    const derivative = await sharp(buffer)
      .rotate()
      .resize({
        width: dimensions[size],
        height: dimensions[size],
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp()
      .toBuffer();

    await storage.put(fileOf(key, size), derivative);
  }

  return key;
}

/** Apaga os dois derivados de uma chave. Idempotente. */
export async function deleteImage(key: string): Promise<void> {
  for (const size of IMAGE_SIZES) {
    await storage.delete(fileOf(key, size));
  }
}
