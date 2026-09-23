import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  errorCodeSchema,
  errorResponseSchema,
  validationErrorResponseSchema,
} from "../src/errors";

// O envelope é o `AppError.toJson()` da API mais o `requestId` que o error
// handler acrescenta. O 422 é o mesmo envelope com `errors` por campo.
const forbidden = {
  name: "ForbiddenError",
  message: "Acesso negado",
  statusCode: 403,
  action: "Você não tem permissão para realizar esta ação",
  code: "FORBIDDEN",
  requestId: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
};

const validation = {
  name: "ValidationError",
  message: "Houve um erro de validação",
  statusCode: 422,
  action: "Verifique os dados enviados e tente novamente",
  code: "VALIDATION_ERROR",
  errors: { email: ["Invalid email address"], "address.zip": ["Required"] },
  requestId: "5b1f8c2e-0d3a-4f5b-9c7d-2a1e6f4b8c90",
};

describe("shape de erro", () => {
  it("aceita o envelope comum, com `action`, `code` e `requestId` opcionais", () => {
    expect(errorResponseSchema.parse(forbidden)).toEqual(forbidden);

    const minimal = { name: "AppError", message: "x", statusCode: 500 };
    expect(errorResponseSchema.parse(minimal)).toEqual(minimal);
  });

  it("mantém o envelope aberto a `code` desconhecido — o cliente tolera o que ainda não conhece", () => {
    const unknown = { ...forbidden, code: "SOMETHING_NEW" };
    expect(errorResponseSchema.parse(unknown)).toEqual(unknown);
  });

  it("nomeia os `code` conhecidos como enum, com os três 403 de login entre eles", () => {
    expect(ERROR_CODES).toContain("UNAUTHORIZED");
    expect(ERROR_CODES).toContain("FORBIDDEN");
    expect(ERROR_CODES).toContain("NOT_FOUND");
    expect(ERROR_CODES).toContain("CONFLICT");
    expect(ERROR_CODES).toContain("VALIDATION_ERROR");
    expect(ERROR_CODES).toContain("ACCOUNT_BANNED");
    expect(ERROR_CODES).toContain("PASSWORD_RESET_REQUIRED");
    expect(ERROR_CODES).toContain("EMAIL_NOT_VERIFIED");
    expect(errorCodeSchema.safeParse("FORBIDDEN").success).toBe(true);
    expect(errorCodeSchema.safeParse("nope").success).toBe(false);
  });

  it("exige `errors` por campo e `code: VALIDATION_ERROR` no 422", () => {
    expect(validationErrorResponseSchema.parse(validation)).toEqual(validation);

    const { errors: _errors, ...withoutErrors } = validation;
    expect(validationErrorResponseSchema.safeParse(withoutErrors).success).toBe(
      false,
    );
    expect(
      validationErrorResponseSchema.safeParse({
        ...validation,
        statusCode: 400,
      }).success,
    ).toBe(false);
  });
});
