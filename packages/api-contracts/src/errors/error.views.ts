import { z } from "zod";

// O shape de erro da API: o `AppError.toJson()` mais o `requestId` que o error
// handler acrescenta. O `code` que ele carrega é o de `error.codes.ts`.

const requestIdSchema = z.string().optional().meta({
  description:
    "Id do request, igual ao header x-request-id. Cite-o ao reportar um problema: ele recupera o request inteiro nos logs.",
  example: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
});

// Envelope comum a todo erro. `action` diz ao usuário o que fazer; `code` é o
// identificador estável para o cliente ramificar (aberto — ver ERROR_CODES).
export const errorResponseSchema = z
  .object({
    name: z.string().meta({ example: "NotFoundError" }),
    message: z.string().meta({ example: "Recurso não encontrado" }),
    statusCode: z.number().meta({ example: 404 }),
    action: z.string().optional().meta({
      example: "Verifique o identificador informado e tente novamente",
    }),
    code: z.string().optional().meta({ example: "NOT_FOUND" }),
    requestId: requestIdSchema,
  })
  .meta({ id: "ErrorResponse", description: "Formato padrão de erro da API" });

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// `errors` por campo do 422: a chave é o caminho do campo (`email`,
// `address.zip` — índices de array removidos), o valor é a lista de mensagens.
// Validação sintática (Zod) e semântica (precisa de banco) produzem o mesmo
// shape, então o cliente trata as duas do mesmo jeito.
export const validationErrorFieldsSchema = z.record(
  z.string(),
  z.array(z.string()),
);

export type ValidationErrorFields = z.infer<typeof validationErrorFieldsSchema>;

export const validationErrorResponseSchema = z
  .object({
    name: z.string().meta({ example: "ValidationError" }),
    message: z
      .string()
      .meta({ example: "Erro de validação nos dados enviados" }),
    statusCode: z.literal(422),
    action: z.string().optional(),
    code: z.literal("VALIDATION_ERROR"),
    errors: validationErrorFieldsSchema.meta({
      example: { email: ["Invalid email address"] },
    }),
    // A descrição é a curta, de propósito: é o que o OpenAPI da API publica
    // hoje para o 422, e o `openapi.json` tem de sair idêntico quando a API
    // passar a importar daqui.
    requestId: z.string().optional().meta({
      description: "Id do request, igual ao header x-request-id.",
      example: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
    }),
  })
  .meta({
    id: "ValidationError",
    description: "Erro de validação (422) com detalhes por campo",
  });

export type ValidationErrorResponse = z.infer<
  typeof validationErrorResponseSchema
>;
