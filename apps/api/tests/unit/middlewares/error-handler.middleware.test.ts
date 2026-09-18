import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from "@/errors";
import { errorHandler } from "@/middlewares/error-handler.middleware";

vi.mock("@/lib/sentry", () => ({
  Sentry: { captureException: vi.fn() },
}));

const { Sentry } = await import("@/lib/sentry");
const captureException = vi.mocked(Sentry.captureException);

function makeRes(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("errorHandler — Sentry capture (7.11)", () => {
  beforeEach(() => {
    captureException.mockClear();
  });

  it("does not capture a 404 (expected API behavior, not a failure)", () => {
    const error = new NotFoundError();

    errorHandler(error, {} as Request, makeRes(), vi.fn() as NextFunction);

    expect(captureException).not.toHaveBeenCalled();
  });

  it("does not capture a 422 validation error", () => {
    const error = new ValidationError({ errors: { email: ["obrigatório"] } });

    errorHandler(error, {} as Request, makeRes(), vi.fn() as NextFunction);

    expect(captureException).not.toHaveBeenCalled();
  });

  it("captures the catch-all InternalServerError (unexpected error)", () => {
    const cause = new Error("boom");

    errorHandler(cause, {} as Request, makeRes(), vi.fn() as NextFunction);

    expect(captureException).toHaveBeenCalledWith(cause);
  });

  it("captures any AppError with statusCode >= 500, not just exactly 500", () => {
    const error = new ServiceUnavailableError();

    errorHandler(error, {} as Request, makeRes(), vi.fn() as NextFunction);

    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("captures an explicit InternalServerError instance", () => {
    const error = new InternalServerError({ cause: new Error("db down") });

    errorHandler(error, {} as Request, makeRes(), vi.fn() as NextFunction);

    expect(captureException).toHaveBeenCalledWith(error);
  });
});
