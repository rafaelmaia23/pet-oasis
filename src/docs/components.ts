/// <reference types="zod-openapi" />
import { z } from "zod";
import type {
  ZodOpenApiResponseObject,
  ZodOpenApiSecuritySchemeObject,
} from "zod-openapi";
import { cursorMetaSchema, offsetMetaSchema } from "@/lib/pagination";

// Formato padrão de erro da API (AppError.toJson) — vira componente reusável.
export const errorResponseSchema = z
  .object({
    name: z.string().meta({ example: "NotFoundError" }),
    message: z.string().meta({ example: "Recurso não encontrado" }),
    statusCode: z.number().meta({ example: 404 }),
    action: z.string().optional().meta({
      example: "Verifique o identificador informado e tente novamente",
    }),
    code: z.string().optional().meta({ example: "NOT_FOUND" }),
    requestId: z.string().optional().meta({
      description:
        "Id do request, igual ao header x-request-id. Cite-o ao reportar um problema: ele recupera o request inteiro nos logs.",
      example: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
    }),
  })
  .meta({ id: "ErrorResponse", description: "Formato padrão de erro da API" });

// Erro de validação (422) — AppError + `errors` por campo.
export const validationErrorSchema = z
  .object({
    name: z.string().meta({ example: "ValidationError" }),
    message: z
      .string()
      .meta({ example: "Erro de validação nos dados enviados" }),
    statusCode: z.literal(422),
    action: z.string().optional(),
    code: z.literal("VALIDATION_ERROR"),
    errors: z
      .record(z.string(), z.array(z.string()))
      .meta({ example: { email: ["Invalid email address"] } }),
    requestId: z.string().optional().meta({
      description: "Id do request, igual ao header x-request-id.",
      example: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
    }),
  })
  .meta({
    id: "ValidationError",
    description: "Erro de validação (422) com detalhes por campo",
  });

export const securitySchemes = {
  bearerAuth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Access token JWT obtido em POST /auth/login",
  } satisfies ZodOpenApiSecuritySchemeObject,
};

function jsonResponse(
  description: string,
  schema: z.ZodType,
): ZodOpenApiResponseObject {
  return { description, content: { "application/json": { schema } } };
}

// Respostas de erro reutilizáveis — referenciar por código nas operações.
export const errorResponses = {
  400: jsonResponse("Requisição malformada", errorResponseSchema),
  401: jsonResponse(
    "Não autenticado (token ausente ou inválido)",
    errorResponseSchema,
  ),
  403: jsonResponse("Sem permissão para executar a ação", errorResponseSchema),
  404: jsonResponse("Recurso não encontrado", errorResponseSchema),
  409: jsonResponse("Conflito — valor único já em uso", errorResponseSchema),
  422: jsonResponse("Erro de validação", validationErrorSchema),
  429: jsonResponse("Muitas tentativas — limite excedido", errorResponseSchema),
} satisfies Record<number, ZodOpenApiResponseObject>;

// Resposta de sucesso sem corpo (204).
export const noContentResponse: ZodOpenApiResponseObject = {
  description: "Sucesso, sem conteúdo",
};

// Envelope `{ data, meta }` das listagens (D4). Uma variante por estratégia de
// paginação; `staticList` é o envelope de meta vazio das listas que não paginam.
const emptyMetaSchema = z
  .object({})
  .meta({ id: "EmptyMeta", description: "Sem metadados de paginação" });

export function offsetList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: offsetMetaSchema });
}

export function cursorList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: cursorMetaSchema });
}

export function staticList(view: z.ZodType) {
  return z.object({ data: z.array(view), meta: emptyMetaSchema });
}

export { jsonResponse };
