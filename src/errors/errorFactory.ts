import type { AppErrorParams } from "./AppError";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  MethodNotAllowedError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
  type ValidationErrorFields,
} from "./AppErrors";

type OmitFixed<T> = Omit<T, "statusCode" | "code">;

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

export const createValidationError = (
  params: { errors?: ValidationErrorFields } & OmitFixed<AppErrorParams> = {},
) => new ValidationError(params);

export const createInternalServerError = (
  params: OmitFixed<AppErrorParams> = {},
) => new InternalServerError(params);

export const createServiceUnavailableError = (
  params: OmitFixed<AppErrorParams> = {},
) => new ServiceUnavailableError(params);
