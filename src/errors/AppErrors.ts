import { AppError, type AppErrorParams } from "./AppError";

// ─── Tipos auxiliares ────────────────────────────────────────────────────────

type OmitFixed<T> = Omit<T, "statusCode" | "code">;

export type ValidationErrorFields = Record<string, string[]>;

// ─── 400 Bad Request ─────────────────────────────────────────────────────────

export class BadRequestError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Requisição inválida",
      action: "Verifique os dados enviados e tente novamente",
      ...params,
      statusCode: 400,
      code: "BAD_REQUEST",
    });
  }
}

// ─── 401 Unauthorized ────────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Não autenticado",
      action: "Faça login e tente novamente",
      ...params,
      statusCode: 401,
      code: "UNAUTHORIZED",
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
      ...params,
      statusCode: 403,
      code: "FORBIDDEN",
    });
  }
}

// ─── 404 Not Found ───────────────────────────────────────────────────────────

export class NotFoundError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Recurso não encontrado",
      action: "Verifique o endereço e tente novamente",
      ...params,
      statusCode: 404,
      code: "NOT_FOUND",
    });
  }
}

// ─── 405 Method Not Allowed ──────────────────────────────────────────────────

export class MethodNotAllowedError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Método HTTP não permitido",
      action: "Verifique o método utilizado na requisição",
      ...params,
      statusCode: 405,
      code: "METHOD_NOT_ALLOWED",
    });
  }
}

// ─── 409 Conflict ────────────────────────────────────────────────────────────

export class ConflictError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Conflito com o estado atual do recurso",
      action: "Verifique os dados e tente novamente",
      ...params,
      statusCode: 409,
      code: "CONFLICT",
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
      ...params,
      statusCode: 422,
      code: "VALIDATION_ERROR",
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
      ...params,
      statusCode: 500,
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// ─── 503 Service Unavailable ─────────────────────────────────────────────────

export class ServiceUnavailableError extends AppError {
  constructor(params: OmitFixed<AppErrorParams> = {}) {
    super({
      message: "Serviço temporariamente indisponível",
      action: "Tente novamente mais tarde",
      ...params,
      statusCode: 503,
      code: "SERVICE_UNAVAILABLE",
    });
  }
}
