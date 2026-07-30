import type { Request, Response } from "express";
import { RateLimiterRes } from "rate-limiter-flexible";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordMock } = vi.hoisted(() => ({ recordMock: vi.fn() }));

vi.mock("@/lib/auditLog", () => ({ record: recordMock }));

const { rateLimitByIp, rateLimitByEmailTarget } = await import(
  "@/lib/rateLimit"
);

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

  it("throws 429, sets Retry-After and records the audit log when the limit is exceeded", async () => {
    const rejection = new RateLimiterRes(0, 5000);
    const limiter = { consume: vi.fn().mockRejectedValue(rejection) };
    const middleware = rateLimitByIp(limiter, "login");
    const { req, res, next } = fakeReqRes();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429 }),
    );
    expect(res.set).toHaveBeenCalledWith("Retry-After", "5");
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

  it("throws 429 with scope EMAIL when the target limit is exceeded", async () => {
    const rejection = new RateLimiterRes(0, 1000);
    const limiter = { consume: vi.fn().mockRejectedValue(rejection) };
    const middleware = rateLimitByEmailTarget(limiter, "forgot-password");
    const { req, res, next } = fakeReqRes({ email: "victim@test.com" });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429 }),
    );
    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_RATE_LIMIT_EXCEEDED",
      targetType: "Route",
      metadata: { rule: "forgot-password", scope: "EMAIL" },
    });
  });
});
