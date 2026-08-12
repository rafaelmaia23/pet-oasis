import type { Request, Response } from "express";
import { RateLimiterRes } from "rate-limiter-flexible";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordMock } = vi.hoisted(() => ({ recordMock: vi.fn() }));

vi.mock("@/lib/auditLog", () => ({ record: recordMock }));

const { rateLimitByIp, rateLimitByEmailTarget, consumeEmailTargetLimit } =
  await import("@/lib/rateLimit");

function fakeReqRes(body: Record<string, unknown> = {}) {
  const req = { ip: "127.0.0.1", body } as Request;
  const res = { set: vi.fn() } as unknown as Response;
  const next = vi.fn();
  return { req, res, next };
}

describe("rateLimitByIp", () => {
  beforeEach(() => {
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  it("calls next() with no error when under the limit", async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({}) };
    const middleware = rateLimitByIp(limiter, "login");
    const { req, res, next } = fakeReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(limiter.consume).toHaveBeenCalledWith("127.0.0.1");
  });

  it("throws 429 carrying a Retry-After header and records the audit log when the limit is exceeded", async () => {
    const rejection = new RateLimiterRes(0, 5000);
    const limiter = { consume: vi.fn().mockRejectedValue(rejection) };
    const middleware = rateLimitByIp(limiter, "login");
    const { req, res, next } = fakeReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        headers: { "Retry-After": "5" },
      }),
    );
    // O header não é mais setado pela middleware: `enforce` também roda dentro
    // de services, sem `res` à mão. Quem aplica é o error handler central.
    expect(res.set).not.toHaveBeenCalled();
    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      targetType: "Route",
      metadata: { rule: "login", scope: "IP" },
    });
  });

  it("fails open (calls next with no error) when the store is unavailable", async () => {
    const limiter = {
      consume: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    };
    const middleware = rateLimitByIp(limiter, "login");
    const { req, res, next } = fakeReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("rateLimitByEmailTarget", () => {
  beforeEach(() => {
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  it("skips consuming when the body has no email", async () => {
    const limiter = { consume: vi.fn() };
    const middleware = rateLimitByEmailTarget(limiter, "forgot-password");
    const { req, res, next } = fakeReqRes({});

    await middleware(req, res, next);

    expect(limiter.consume).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  it("consumes by the lowercased email", async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({}) };
    const middleware = rateLimitByEmailTarget(limiter, "forgot-password");
    const { req, res, next } = fakeReqRes({ email: "User@Test.com" });

    await middleware(req, res, next);

    expect(limiter.consume).toHaveBeenCalledWith("user@test.com");
    expect(next).toHaveBeenCalledWith();
  });

  it("throws 429 with scope EMAIL and a Retry-After header when the target limit is exceeded", async () => {
    const rejection = new RateLimiterRes(0, 1000);
    const limiter = { consume: vi.fn().mockRejectedValue(rejection) };
    const middleware = rateLimitByEmailTarget(limiter, "forgot-password");
    const { req, res, next } = fakeReqRes({ email: "victim@test.com" });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 429,
        headers: { "Retry-After": "1" },
      }),
    );
    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      targetType: "Route",
      metadata: { rule: "forgot-password", scope: "EMAIL" },
    });
  });
});

/**
 * O consumo sem middleware existe porque os dois pontos novos da Fase 8 só
 * conhecem o email-alvo dentro do service (8.7): o signup só deve consumir no
 * ramo de reativação, e `POST /users/:id/reactivate` não recebe email nenhum
 * no request.
 */
describe("consumeEmailTargetLimit", () => {
  beforeEach(() => {
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  it("resolves without throwing when under the limit, consuming by the lowercased email", async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({}) };

    await expect(
      consumeEmailTargetLimit(
        limiter,
        "Victim@Test.com",
        "signup-reactivation",
      ),
    ).resolves.toBeUndefined();
    expect(limiter.consume).toHaveBeenCalledWith("victim@test.com");
  });

  it("throws 429 with a Retry-After header and records the audit log when the limit is exceeded", async () => {
    const rejection = new RateLimiterRes(0, 2000);
    const limiter = { consume: vi.fn().mockRejectedValue(rejection) };

    await expect(
      consumeEmailTargetLimit(
        limiter,
        "victim@test.com",
        "account-reactivation",
      ),
    ).rejects.toMatchObject({
      statusCode: 429,
      headers: { "Retry-After": "2" },
    });
    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      targetType: "Route",
      metadata: { rule: "account-reactivation", scope: "EMAIL" },
    });
  });

  it("fails open when the store is unavailable", async () => {
    const limiter = {
      consume: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
    };

    await expect(
      consumeEmailTargetLimit(
        limiter,
        "victim@test.com",
        "signup-reactivation",
      ),
    ).resolves.toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });
});
