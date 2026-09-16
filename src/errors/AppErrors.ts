import { AppError, type AppErrorParams } from "./AppError";

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

// O status é fixo por subclasse — é a identidade HTTP dela. O `code` tem
// default por subclasse mas é parametrizável: uma mesma resposta 403 pode
// precisar de identificadores distintos por condição (10.8), e é no `code`,
// nunca na prosa de `message`, que o cliente ramifica.
export type OmitFixed<T> = Omit<T, "statusCode">;

export type ValidationErrorFields = Record<string, string[]>;

// ─── 400 Bad Request ─────────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Requisição inválida",
      action: "Verifique os dados enviados e tente novamente",
      code: "BAD_REQUEST",
      ...params,
      statusCode: 400,
    });
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Não autenticado",
      action: "Faça login e tente novamente",
      code: "UNAUTHORIZED",
      ...params,
      statusCode: 401,
    });
  }
}

// ─── 403 Forbidden ───────────────────────────────────────────────────────────

export class ForbiddenError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Acesso negado",
      action:
        "Você não tem permissão para realizar esta ação. Entre em contato com o suporte caso acredite que isso é um erro",
      code: "FORBIDDEN",
      ...params,
      statusCode: 403,
    });
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Recurso não encontrado",
      action: "Verifique o endereço e tente novamente",
      code: "NOT_FOUND",
      ...params,
      statusCode: 404,
    });
  }
}

// ─── 405 Method Not Allowed ──────────────────────────────────────────────────

export class MethodNotAllowedError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Método HTTP não permitido",
      action: "Verifique o método utilizado na requisição",
      code: "METHOD_NOT_ALLOWED",
      ...params,
      statusCode: 405,
    });
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Conflito com o estado atual do recurso",
      action: "Verifique os dados e tente novamente",
      code: "CONFLICT",
      ...params,
      statusCode: 409,
    });
  }
}

// ─── 413 Payload Too Large ───────────────────────────────────────────────────

export class PayloadTooLargeError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Corpo da requisição excede o tamanho máximo permitido",
      action: "Reduza o tamanho dos dados enviados e tente novamente",
      code: "PAYLOAD_TOO_LARGE",
      ...params,
      statusCode: 413,
    });
  }
}

// ─── 429 Too Many Requests ───────────────────────────────────────────────────

export class TooManyRequestsError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Muitas tentativas. Tente novamente mais tarde.",
      action: "Aguarde antes de tentar novamente",
      code: "TOO_MANY_REQUESTS",
      ...params,
      statusCode: 429,
    });
  }
}

// ─── 422 Validation Error ────────────────────────────────────────────────────

type ValidationErrorParams = OmitFixed<AppErrorParams> & {
  errors?: ValidationErrorFields;
};

export class ValidationError extends AppError {
  public readonly errors: ValidationErrorFields;

  constructor({ errors = {}, ...params }: ValidationErrorParams = {}) {
    super({
      message: "Houve um erro de validação",
      action: "Verifique os dados enviados e tente novamente",
      code: "VALIDATION_ERROR",
      ...params,
      statusCode: 422,
    });
    this.errors = errors;
  }

  toJson() {
    return {
      ...super.toJson(),
      errors: this.errors,
    };
  }
}

// ─── 500 Internal Server Error ───────────────────────────────────────────────

export class InternalServerError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Erro interno do servidor",
      action:
        "Tente novamente mais tarde. Se o problema persistir, entre em contato com o suporte",
      code: "INTERNAL_SERVER_ERROR",
      ...params,
      statusCode: 500,
    });
  }
}

// ─── 503 Service Unavailable ─────────────────────────────────────────────────

export class ServiceUnavailableError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Serviço temporariamente indisponível",
      action: "Tente novamente mais tarde",
      code: "SERVICE_UNAVAILABLE",
      ...params,
      statusCode: 503,
    });
  }
}

// ─── 500 Presentation Error (violação de contrato de saída) ─────────────────
export class PresentationError extends AppError {
  public readonly context?: Record<string, unknown> | undefined;

  constructor(
    params: OmitFixed<AppErrorParams> & {
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    const { context, ...rest } = params;
    super({
      message: "Erro ao processar resposta do servidor",
      action:
        "Tente novamente mais tarde. Se o problema persistir, entre em contato com o suporte",
      code: "PRESENTATION_ERROR",
      ...rest,
      statusCode: 500,
    });
    this.context = context;
  }
}
