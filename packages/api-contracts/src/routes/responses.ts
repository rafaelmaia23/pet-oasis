import { z } from "zod";
import {
  errorResponseSchema,
  validationErrorResponseSchema,
} from "../errors/index";
import type { RouteErrorResponse, RouteResponse } from "./route.types";

/**
 * O shape de erro por status, com a prosa que o explica. Cada rota da tabela
 * lista só os status que realmente pode devolver — a lista é o que o cliente
 * usa para saber o que tratar.
 *
 * O envelope é sempre o mesmo (`errorResponseSchema`), menos o 422, que
 * acrescenta `errors` por campo. Uma rota que precise de prosa própria num
 * status (o 403 do login, por exemplo) espalha a entrada daqui e sobrescreve a
 * `description`.
 */
export const errorResponses = {
  400: { description: "Requisição malformada", schema: errorResponseSchema },
  401: {
    description: "Não autenticado (token ausente ou inválido)",
    schema: errorResponseSchema,
  },
  403: {
    description: "Sem permissão para executar a ação",
    schema: errorResponseSchema,
  },
  404: { description: "Recurso não encontrado", schema: errorResponseSchema },
  409: {
    description: "Conflito — valor único já em uso",
    schema: errorResponseSchema,
  },
  // 9.10: upload acima de UPLOAD_MAX_FILE_SIZE_BYTES. O teto é do multer — o
  // JSON_BODY_LIMIT só age em `application/json` e não alcança multipart.
  413: {
    description: "Arquivo maior que o tamanho máximo permitido",
    schema: errorResponseSchema,
  },
  422: {
    description: "Erro de validação",
    schema: validationErrorResponseSchema,
  },
  // 10.22: rate limit por IP e lockout por usuário respondem o mesmo 429 —
  // mesmo `code`, mesma prosa —, e ambos carregam `Retry-After`. O cliente usa
  // o valor, não a mensagem.
  429: {
    description: "Muitas tentativas — limite excedido",
    schema: errorResponseSchema,
    headers: z.object({
      "Retry-After": z.number().int().positive().meta({
        description:
          "Segundos até a próxima tentativa ser aceita (rate limit ou lockout de conta).",
        example: 900,
      }),
    }),
  },
  // 10.7: dependência externa indisponível. É **retentável** — o cliente que
  // recebe isso no refresh deve tentar de novo, não deslogar.
  503: {
    description: "Dependência externa indisponível — tente novamente",
    schema: errorResponseSchema,
  },
} satisfies Record<number, RouteErrorResponse>;

/**
 * Sucesso **sem corpo** (204). É a resposta de toda escrita cujo resultado é o
 * próprio estado desejado — o cliente relê o recurso se precisar dele.
 */
export const noContent: RouteResponse = {
  description: "Sucesso, sem conteúdo",
};
