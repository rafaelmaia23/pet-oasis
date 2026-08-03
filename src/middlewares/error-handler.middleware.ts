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
import { logger } from "@/lib/logger";
import { getRequestContext } from "@/lib/requestContext";
import { Sentry } from "@/lib/sentry";

const log = logger.child({ module: "http" });

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

/**
 * Ponto único de saída: loga o erro **uma vez** e responde.
 *
 * O nível segue a política §3.1: 5xx é falha de verdade (`error`, com stack,
 * porque alguém precisa agir); 4xx é comportamento correto da API diante de um
 * request ruim (`warn`, sem stack — um 404 não é incidente).
 *
 * O corpo carrega o `requestId`, que é o mesmo do header `x-request-id` e o
 * mesmo das linhas de access e application log: quem reporta um problema cita o
 * id e o request inteiro é recuperável. Stack nunca vai no corpo.
 */
function respond(
  res: Response,
  statusCode: number,
  body: Record<string, unknown>,
  error: unknown,
) {
  const requestId = getRequestContext()?.requestId;

  if (statusCode >= 500) {
    log.error({ err: error, statusCode }, "request failed with server error");
    // 7.11: só falha de verdade vai pro Sentry — 4xx é comportamento correto
    // da API, não incidente. No-op seguro quando SENTRY_DSN não está setado.
    Sentry.captureException(error);
  } else {
    log.warn({ statusCode, code: body.code }, "request rejected");
  }

  return res.status(statusCode).json({ ...body, requestId });
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
    return respond(
      res,
      badRequestError.statusCode,
      badRequestError.toJson(),
      err,
    );
  }

  // Corpo acima do teto de `express.json({ limit })` — o body-parser lança um
  // erro com `type: "entity.too.large"`/`status: 413` que, sem isto, cairia no
  // fallback 500. A resposta não revela o limite configurado.
  if (isPayloadTooLargeError(err)) {
    const payloadTooLargeError = createPayloadTooLargeError();
    return respond(
      res,
      payloadTooLargeError.statusCode,
      payloadTooLargeError.toJson(),
      err,
    );
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
    return respond(
      res,
      validationError.statusCode,
      validationError.toJson(),
      err,
    );
  }

  if (err instanceof PrismaClientKnownRequestError && err.code === "P2002") {
    const driverAdapterError = err.meta?.driverAdapterError as
      | DriverAdapterConstraintError
      | undefined;
    const fields = driverAdapterError?.cause?.constraint?.fields ?? [];
    const field =
      fields[0] ??
      "{ERROR: name of field was not identified in the error object}";

    return respond(
      res,
      409,
      {
        name: "ConflictError",
        message: `O ${field} informado já está em uso`,
        action: `Tente outro valor para o campo ${field}`,
        statusCode: 409,
        code: "CONFLICT",
      },
      err,
    );
  }

  if (err instanceof PresentationError) {
    return respond(res, err.statusCode, err.toJson(), err);
  }

  // Erro operacional — lançado intencionalmente pelo dev
  if (err instanceof AppError) {
    return respond(res, err.statusCode, err.toJson(), err);
  }

  // Erro inesperado — esconde detalhes do usuário, loga internamente para debug
  const internalError = new InternalServerError({ cause: err });

  return respond(
    res,
    internalError.statusCode,
    internalError.toJson(),
    err ?? internalError,
  );
}
