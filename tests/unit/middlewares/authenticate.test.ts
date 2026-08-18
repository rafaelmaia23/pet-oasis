import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { UnauthorizedError } from "@/errors";
import {
  authenticate,
  optionalAuthenticate,
} from "@/middlewares/authenticate.middleware";
import { getUserForFeatureComputation } from "@/modules/user/user.repository";

vi.mock("@/modules/user/user.repository");

const mockedGetUserForFeatureComputation = vi.mocked(
  getUserForFeatureComputation,
);

function makeReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader } } as Request;
}

function signToken(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "15m", ...options });
}

describe("authenticate middleware", () => {
  beforeEach(() => {
    mockedGetUserForFeatureComputation.mockReset();
  });

  it("no Authorization header -> calls next() without error, req.user stays undefined", async () => {
    const req = makeReq(undefined);
    const next = vi.fn() as NextFunction;

    await authenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("header without 'Bearer ' prefix -> rejects with 401", async () => {
    const req = makeReq("Token abc123");
    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("empty token after 'Bearer ' -> rejects with 401", async () => {
    const req = makeReq("Bearer ");
    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("malformed/invalid-signature JWT -> rejects with 401", async () => {
    const req = makeReq("Bearer not-a-real-jwt");
    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("expired JWT -> rejects with 401", async () => {
    const token = signToken({ sub: "user-id" }, { expiresIn: -10 });
    const req = makeReq(`Bearer ${token}`);
    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("valid JWT without sub -> rejects with 401", async () => {
    const token = signToken({});
    const req = makeReq(`Bearer ${token}`);
    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("valid JWT, user not found -> rejects with 401", async () => {
    mockedGetUserForFeatureComputation.mockResolvedValue(null);
    const token = signToken({ sub: "missing-user-id" });
    const req = makeReq(`Bearer ${token}`);

    await expect(
      authenticate(req, {} as Response, vi.fn()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    expect(mockedGetUserForFeatureComputation).toHaveBeenCalledWith(
      "missing-user-id",
    );
  });

  it("valid JWT + user found -> populates req.user and calls next() without error", async () => {
    mockedGetUserForFeatureComputation.mockResolvedValue({
      roles: [
        {
          role: { features: [{ feature: { name: "read:user" } }] },
          features: [{ granted: true, feature: { name: "read:permission" } }],
        },
      ],
    } as Awaited<ReturnType<typeof getUserForFeatureComputation>>);

    const token = signToken({ sub: "user-id-123" });
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();

    await authenticate(req, {} as Response, next);

    expect(req.user).toEqual({
      id: "user-id-123",
      features: new Set(["read:user", "read:permission"]),
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("regression: getUserForFeatureComputation is called exactly once per request", async () => {
    mockedGetUserForFeatureComputation.mockResolvedValue({
      roles: [],
      features: [],
    } as unknown as Awaited<ReturnType<typeof getUserForFeatureComputation>>);

    const token = signToken({ sub: "user-id-123" });
    const req = makeReq(`Bearer ${token}`);

    await authenticate(req, {} as Response, vi.fn());

    expect(mockedGetUserForFeatureComputation).toHaveBeenCalledTimes(1);
  });
});

/**
 * A vitrine pública do catálogo (9.1/N15) precisa de um terceiro comportamento
 * além do "exige token" e do "nem olha": identificar o ator quando ele vem, e
 * seguir **anônimo** quando não vem — sem nunca responder 401, porque a mesma
 * rota atende o visitante que chegou pelo Google e o funcionário logado.
 *
 * O contraste com o bloco acima é o teste: cada caso que `authenticate` rejeita
 * com 401, `optionalAuthenticate` deixa passar sem `req.user`.
 */
describe("optionalAuthenticate middleware", () => {
  beforeEach(() => {
    mockedGetUserForFeatureComputation.mockReset();
  });

  it("no Authorization header -> next() without error, anonymous", async () => {
    const req = makeReq(undefined);
    const next = vi.fn() as NextFunction;

    await optionalAuthenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("header without 'Bearer ' prefix -> next() anonymous, never 401", async () => {
    const req = makeReq("Token abc123");
    const next = vi.fn() as NextFunction;

    await optionalAuthenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("malformed JWT -> next() anonymous, never 401", async () => {
    const req = makeReq("Bearer not-a-real-jwt");
    const next = vi.fn() as NextFunction;

    await optionalAuthenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("expired JWT -> next() anonymous, never 401", async () => {
    const token = signToken({ sub: "user-id" }, { expiresIn: -10 });
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn() as NextFunction;

    await optionalAuthenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("valid JWT of a user that no longer exists -> next() anonymous", async () => {
    mockedGetUserForFeatureComputation.mockResolvedValue(null);
    const token = signToken({ sub: "missing-user-id" });
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn() as NextFunction;

    await optionalAuthenticate(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeUndefined();
  });

  it("valid JWT + user found -> populates req.user, same shape as authenticate", async () => {
    mockedGetUserForFeatureComputation.mockResolvedValue({
      roles: [
        {
          role: {
            features: [{ feature: { name: "manage:catalog-structure" } }],
          },
          features: [],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof getUserForFeatureComputation>>);

    const token = signToken({ sub: "user-id-123" });
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();

    await optionalAuthenticate(req, {} as Response, next);

    expect(req.user).toEqual({
      id: "user-id-123",
      features: new Set(["manage:catalog-structure"]),
    });
    expect(next).toHaveBeenCalledWith();
  });
});
