import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppError,
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

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
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
