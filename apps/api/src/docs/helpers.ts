import { z } from "zod";
import type {
  ZodObjectInput,
  ZodOpenApiOperationObject,
  ZodOpenApiParameters,
} from "zod-openapi";

type EnvelopeParts = Pick<
  ZodOpenApiOperationObject,
  "requestParams" | "requestBody"
>;

/**
 * Extrai as partes internas do envelope `z.object({ body?, params?, query? })`
 * usado pelos schemas de request, sem quebrar essa convenção: `params` → `path`,
 * `query` → `query`, `body` → requestBody JSON. Só emite o que existir.
 */
export function fromEnvelope<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): EnvelopeParts {
  const shape = schema.shape;
  const parts: EnvelopeParts = {};

  const requestParams: ZodOpenApiParameters = {};
  if (shape.params) {
    requestParams.path = shape.params as unknown as ZodObjectInput;
  }
  if (shape.query) {
    requestParams.query = shape.query as unknown as ZodObjectInput;
  }
  if (Object.keys(requestParams).length > 0) {
    parts.requestParams = requestParams;
  }

  if (shape.body) {
    parts.requestBody = {
      content: { "application/json": { schema: shape.body } },
    };
  }

  return parts;
}

/**
 * Corpo `multipart/form-data` de um upload de imagem (9.10). Um campo, um
 * arquivo — a API não aceita lote: o cliente que deixa o usuário escolher oito
 * fotos dispara oito requests, e ganha progresso e retry por imagem.
 *
 * O teto de tamanho é do multer, e **não** do `JSON_BODY_LIMIT` — aquele só age
 * em `application/json` e não tem efeito nenhum aqui.
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
