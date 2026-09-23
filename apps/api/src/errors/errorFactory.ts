import type { AppErrorParams } from "./AppError";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  type OmitFixed,
  PayloadTooLargeError,
  PresentationError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
  type ValidationErrorFields,
} from "./AppErrors";

export const createBadRequestError = (params: OmitFixed<AppErrorParams> = {}) =>
  new BadRequestError(params);

export const createUnauthorizedError = (
  params: OmitFixed<AppErrorParams> = {},
) => new UnauthorizedError(params);

export const createForbiddenError = (params: OmitFixed<AppErrorParams> = {}) =>
  new ForbiddenError(params);

export const createNotFoundError = (params: OmitFixed<AppErrorParams> = {}) =>
  new NotFoundError(params);

export const createMethodNotAllowedError = (
  params: OmitFixed<AppErrorParams> = {},
) => new MethodNotAllowedError(params);

export const createConflictError = (params: OmitFixed<AppErrorParams> = {}) =>
  new ConflictError(params);

export const createPayloadTooLargeError = (
  params: OmitFixed<AppErrorParams> = {},
) => new PayloadTooLargeError(params);

export const createTooManyRequestsError = (
  params: OmitFixed<AppErrorParams> = {},
) => new TooManyRequestsError(params);

/**
 * O header `Retry-After` de um 429, a partir de quanto falta em ms. Um lugar só
 * para os dois emissores (rate limit e lockout, 10.22): segundos arredondados
 * para cima, piso em 1 — o rate limit nunca chega a 0 (`msBeforeNext` de uma
 * rejeição é sempre positivo), mas o lockout relê o relógio depois de decidir
 * que está travado e pode cair alguns ms abaixo, e `Retry-After: 0` não é
 * "tente agora" para ninguém.
 */
export const retryAfterHeader = (msUntilRetry: number) => ({
  "Retry-After": Math.max(1, Math.ceil(msUntilRetry / 1000)).toString(),
});

export const createValidationError = (
  params: { errors?: ValidationErrorFields } & OmitFixed<AppErrorParams> = {},
) => new ValidationError(params);

export const createInternalServerError = (
  params: OmitFixed<AppErrorParams> = {},
) => new InternalServerError(params);

export const createServiceUnavailableError = (
  params: OmitFixed<AppErrorParams> = {},
) => new ServiceUnavailableError(params);

export const createPresentationError = (
  params: OmitFixed<AppErrorParams> & {
    context?: Record<string, unknown>;
    cause?: unknown;
  } = {},
) => new PresentationError(params);
