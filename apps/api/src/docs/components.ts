/// <reference types="zod-openapi" />

import { z } from "zod";
import type {
  ZodOpenApiOperationObject,
  ZodOpenApiSecuritySchemeObject,
} from "zod-openapi";

// O que o **servidor** acrescenta ao documento, e que por isso não cabe na
// tabela de rotas do contrato: como o token viaja e como um upload chega. Todo
// o resto — path, request, resposta, prosa — vem de
// `@pet-oasis/api-contracts/routes`.

export const securitySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token JWT obtido em POST /auth/login",
  } satisfies ZodOpenApiSecuritySchemeObject,
};

/**
 * Corpo `multipart/form-data` de um upload de imagem (9.10). Um campo, um
 * arquivo — a API não aceita lote: o cliente que deixa o usuário escolher oito
 * fotos dispara oito requests, e ganha progresso e retry por imagem.
 *
 * Mora aqui, e não no contrato, porque tudo o que ele declara é do servidor: o
 * teto de tamanho é do multer (**não** do `JSON_BODY_LIMIT`, que só age em
 * `application/json`), e os formatos aceitos são os que o pipeline de imagem
 * sabe converter. A tabela de rotas só diz `upload: "image"`.
 */
export function imageUploadBody(sizeLimitBytes: number) {
  return {
    requestBody: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().meta({
              format: "binary",
              description: `Imagem JPEG, PNG ou WebP de até ${Math.floor(
                sizeLimitBytes / (1024 * 1024),
              )} MB. O formato é conferido pelos bytes do arquivo, não pela extensão nem pelo Content-Type; a saída é sempre WebP, em dois tamanhos.`,
            }),
          }),
        },
      },
    },
  } satisfies Pick<ZodOpenApiOperationObject, "requestBody">;
}
