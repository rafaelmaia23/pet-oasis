import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppError,
  createBadRequestError,
  createPayloadTooLargeError,
  createValidationError,
  InternalServerError,
  PresentationError,
} from "@/errors";
import { PrismaClientKnownRequestError } from "@/generated/prisma/internal/prismaNamespace";

// Formato interno do driver adapter `pg` pra erro de constraint — não é tipado
// pelo Prisma (meta é Record<string, unknown>); shape inferido do runtime.
type DriverAdapterConstraintError = {
  cause?: {
    constraint?: {
      fields?: string[];
    };
  };
};

// O erro do body-parser não é exportado como classe; identifica-se pelo shape
// (`type`/`status`), como já se faz com o SyntaxError de parse.
function isPayloadTooLargeError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as { type?: string }).type === "entity.too.large"
  );
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Corpo malformado — body-parser (express.json) lança um SyntaxError com
  // `body`/`type: "entity.parse.failed"`/`status: 400` que, sem isto, cairia
  // no fallback 500. Responde 400 genérico (não vaza o parse error interno).
  if (err instanceof SyntaxError && "body" in err) {
    const badRequestError = createBadRequestError({
      message: "Corpo da requisição inválido",
      action: "Envie um JSON válido no corpo da requisição",
    });
    return res
      .status(badRequestError.statusCode)
      .json(badRequestError.toJson());
  }

  // Corpo acima do teto de `express.json({ limit })` — o body-parser lança um
  // erro com `type: "entity.too.large"`/`status: 413` que, sem isto, cairia no
  // fallback 500. A resposta não revela o limite configurado.
  if (isPayloadTooLargeError(err)) {
    const payloadTooLargeError = createPayloadTooLargeError();
    return res
      .status(payloadTooLargeError.statusCode)
      .json(payloadTooLargeError.toJson());
  }

  if (err instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const path = issue.path.slice(1); // tira o "body"/"params" prefix
      const field =
        path
          .filter((seg) => typeof seg !== "number") // remove índices de array
          .join(".") || issue.path.join(".");
      if (!fieldErrors[field]) {
        fieldErrors[field] = [];
      }
      fieldErrors[field].push(issue.message);
    }

    const validationError = createValidationError({
      errors: fieldErrors,
    });
    return res
      .status(validationError.statusCode)
      .json(validationError.toJson());
  }

  if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
    const driverAdapterError = err.meta?.driverAdapterError as
      | DriverAdapterConstraintError
      | undefined;
    const fields = driverAdapterError?.cause?.constraint?.fields ?? [];
    const field =
      fields[0] ??
      "{ERROR: name of field was not identified in the error object}";

    return res.status(409).json({
      name: "ConflictError",
      message: `O ${field} informado já está em uso`,
      action: `Tente outro valor para o campo ${field}`,
      statusCode: 409,
      code: "CONFLICT",
    });
  }

  if (err instanceof PresentationError) {
    console.error("🔥 Presentation error details:", err);
    return res.status(err.statusCode).json(err.toJson());
  }

  // Erro operacional — lançado intencionalmente pelo dev
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJson());
  }

  // Erro inesperado — esconde detalhes do usuário, loga internamente para debug
  console.error("🔥 Unexpected error:", err);

  const internalError = new InternalServerError({ cause: err });

  return res.status(internalError.statusCode).json(internalError.toJson());
}
