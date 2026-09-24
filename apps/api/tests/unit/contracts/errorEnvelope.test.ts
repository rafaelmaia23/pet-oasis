import {
  ERROR_CODES,
  errorResponseSchema,
  validationErrorResponseSchema,
} from "@pet-oasis/api-contracts/errors";
import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  BadRequestError,
  ConflictError,
  createForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  PresentationError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from "@/errors";
import { PrismaClientKnownRequestError } from "@/generated/prisma/internal/prismaNamespace";
import { errorHandler } from "@/middlewares/error-handler.middleware";

vi.mock("@/lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}));

// O vocabulário de erro tem **um** dono: `ERROR_CODES` do contrato. Este teste
// é o que amarra as duas declarações — a do contrato e a das classes da API —
// pelo corpo que o cliente de fato recebe. O que ele prova é o envelope
// serializado pelo ponto único de saída (`errorHandler`), e não o `toJson()`
// solto: é esse corpo, com `requestId`, que o esforço do web vai parsear.

/** O corpo que o error handler serializou para este erro. */
function serialize(error: unknown): unknown {
  const json = vi.fn().mockReturnThis();
  const res = {
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json,
  } as unknown as Response;

  errorHandler(error, {} as Request, res, vi.fn() as NextFunction);

  return json.mock.calls[0]?.[0];
}

// Uma instância por erro que a API emite — as 11 classes de envelope simples e,
// depois delas, as três recusas de login pós-senha, que não têm classe própria
// mas têm `code` próprio, porque é por ele que o cliente leva o usuário ao
// lugar certo. A lista é exaustiva de propósito: erro novo sem entrada aqui é
// erro cujo envelope ninguém provou.
const errors = [
  new BadRequestError(),
  new UnauthorizedError(),
  createForbiddenError(),
  new NotFoundError(),
  new MethodNotAllowedError(),
  new ConflictError(),
  new PayloadTooLargeError(),
  new TooManyRequestsError({ headers: { "Retry-After": "30" } }),
  new InternalServerError(),
  new ServiceUnavailableError(),
  new PresentationError({ context: { view: "userViews.public" } }),
  createForbiddenError({ code: "ACCOUNT_BANNED" }),
  createForbiddenError({ code: "PASSWORD_RESET_REQUIRED" }),
  createForbiddenError({ code: "EMAIL_NOT_VERIFIED" }),
] as const;

describe("envelope de erro: contrato × API", () => {
  for (const error of errors) {
    const label = `${error.name} (${error.code})`;

    it(`${label}: o corpo serializado é o envelope do contrato`, () => {
      expect(serialize(error)).toMatchView(errorResponseSchema);
    });

    it(`${label}: o code está no enum do contrato`, () => {
      expect(ERROR_CODES).toContain(error.code);
    });
  }

  it("o 422 por campo é o envelope de validação do contrato", () => {
    const error = new ValidationError({
      errors: { email: ["Email inválido"], "address.zip": ["Obrigatório"] },
    });

    expect(serialize(error)).toMatchView(validationErrorResponseSchema);
  });

  it("o 409 de violação de unicidade sai pelo mesmo caminho dos outros", () => {
    const p2002 = new PrismaClientKnownRequestError(
      "Unique constraint failed on the fields: (`email`)",
      {
        code: "P2002",
        clientVersion: "7.8.0",
        meta: {
          driverAdapterError: { cause: { constraint: { fields: ["email"] } } },
        },
      },
    );

    const body = serialize(p2002);

    expect(body).toMatchView(errorResponseSchema);
    expect(body).toMatchObject({
      name: new ConflictError().name,
      statusCode: 409,
      code: "CONFLICT",
      message: "O email informado já está em uso",
      action: "Tente outro valor para o campo email",
    });
  });

  // Quem recusa um code inventado é o compilador, não o runtime — e é por isso
  // que o assert deste caso é a própria diretiva `@ts-expect-error`: se `code`
  // voltar a ser `string`, ela fica sem erro para suprimir e o `pnpm typecheck`
  // reprova. O `expect` abaixo é o outro lado do mesmo fato: em runtime o valor
  // passa, e sairia para o cliente fora do enum que o contrato publica.
  it("recusa em compile-time um code fora do enum do contrato", () => {
    // @ts-expect-error — "MADE_UP_CODE" não é um ErrorCode do contrato
    const error = createForbiddenError({ code: "MADE_UP_CODE" });

    expect(ERROR_CODES).not.toContain(error.code);
  });
});
