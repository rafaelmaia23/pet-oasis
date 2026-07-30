import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/config/env";
import { applyFailure, isLocked, type LockoutState } from "@/lib/lockout";

const config = { threshold: 3, windowMs: 1000, maxMs: 4000 };

describe("isLocked", () => {
  it("is false when there is no lockedUntil", () => {
    expect(
      isLocked({ failures: 0, backoffLevel: 0, lockedUntil: null }, 0),
    ).toBe(false);
  });

  it("is true strictly before lockedUntil", () => {
    expect(
      isLocked({ failures: 0, backoffLevel: 1, lockedUntil: 1000 }, 999),
    ).toBe(true);
  });

  it("is false at or after lockedUntil", () => {
    expect(
      isLocked({ failures: 0, backoffLevel: 1, lockedUntil: 1000 }, 1000),
    ).toBe(false);
  });
});

describe("applyFailure", () => {
  it("does not lock before reaching the threshold", () => {
    let state: LockoutState = {
      failures: 0,
      backoffLevel: 0,
      lockedUntil: null,
    };

    for (let i = 0; i < config.threshold - 1; i++) {
      const outcome = applyFailure(state, 0, config);
      expect(outcome.triggered).toBe(false);
      state = outcome.state;
    }

    expect(isLocked(state, 0)).toBe(false);
  });

  it("locks on the threshold-th failure", () => {
    let state: LockoutState = {
      failures: 0,
      backoffLevel: 0,
      lockedUntil: null,
    };

    for (let i = 0; i < config.threshold - 1; i++) {
      state = applyFailure(state, 0, config).state;
    }

    const outcome = applyFailure(state, 0, config);

    expect(outcome.triggered).toBe(true);
    if (!outcome.triggered) throw new Error("unreachable");
    expect(outcome.failureCount).toBe(config.threshold);
    expect(outcome.backoffLevel).toBe(1);
    expect(outcome.unlockAt).toBe(config.windowMs);
    expect(outcome.state).toEqual({
      failures: 0,
      backoffLevel: 1,
      lockedUntil: config.windowMs,
    });
  });

  it("does not escalate a wrong attempt while still locked", () => {
    const state: LockoutState = {
      failures: 0,
      backoffLevel: 1,
      lockedUntil: 1000,
    };

    const outcome = applyFailure(state, 500, config);

    expect(outcome.triggered).toBe(false);
    expect(outcome.state).toEqual(state);
  });

  it("doubles the backoff on the next wrong attempt after the window expires", () => {
    const state: LockoutState = {
      failures: 0,
      backoffLevel: 1,
      lockedUntil: 1000,
    };

    const outcome = applyFailure(state, 1500, config);

    expect(outcome.triggered).toBe(true);
    if (!outcome.triggered) throw new Error("unreachable");
    expect(outcome.backoffLevel).toBe(2);
    expect(outcome.state.lockedUntil).toBe(1500 + config.windowMs * 2);
  });

  it("caps the backoff window at maxMs", () => {
    const state: LockoutState = {
      failures: 0,
      backoffLevel: 10,
      lockedUntil: 1000,
    };

    const outcome = applyFailure(state, 1500, config);

    expect(outcome.state.lockedUntil).toBe(1500 + config.maxMs);
  });
});

const { hgetallMock, hsetMock, pexpireMock, delMock, recordMock } = vi.hoisted(
  () => ({
    hgetallMock: vi.fn(),
    hsetMock: vi.fn(),
    pexpireMock: vi.fn(),
    delMock: vi.fn(),
    recordMock: vi.fn(),
  }),
);

vi.mock("@/lib/redis", () => ({
  redis: {
    hgetall: hgetallMock,
    hset: hsetMock,
    pexpire: pexpireMock,
    del: delMock,
  },
}));

vi.mock("@/lib/auditLog", () => ({ record: recordMock }));

const { getLockoutState, recordFailure, clearLockout } = await import(
  "@/lib/lockout"
);

describe("getLockoutState", () => {
  beforeEach(() => {
    hgetallMock.mockReset();
  });

  it("is not locked when there is no state in Redis", async () => {
    hgetallMock.mockResolvedValue({});

    const result = await getLockoutState("user-1");

    expect(result.isLocked).toBe(false);
  });

  it("is locked when lockedUntil is in the future", async () => {
    hgetallMock.mockResolvedValue({
      failures: "0",
      backoffLevel: "1",
      lockedUntil: String(Date.now() + 100_000),
    });

    const result = await getLockoutState("user-1");

    expect(result.isLocked).toBe(true);
  });

  it("fails open when Redis is unavailable", async () => {
    hgetallMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const result = await getLockoutState("user-1");

    expect(result.isLocked).toBe(false);
  });
});

describe("recordFailure", () => {
  beforeEach(() => {
    hgetallMock.mockReset();
    hsetMock.mockReset();
    pexpireMock.mockReset();
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  it("persists the incremented failure count without recording audit below the threshold", async () => {
    hgetallMock.mockResolvedValue({});

    await recordFailure("user-1");

    expect(hsetMock).toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("records AUTH_LOCKOUT_TRIGGERED once the threshold is crossed", async () => {
    hgetallMock.mockResolvedValue({
      failures: String(env.LOCKOUT_THRESHOLD - 1),
      backoffLevel: "0",
      lockedUntil: "",
    });

    await recordFailure("user-1");

    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_LOCKOUT_TRIGGERED",
      targetType: "User",
      targetId: "user-1",
      metadata: expect.objectContaining({
        backoffLevel: 1,
      }),
    });
  });

  it("fails open (does not throw) when Redis is unavailable", async () => {
    hgetallMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    await expect(recordFailure("user-1")).resolves.toBeUndefined();
    expect(recordMock).not.toHaveBeenCalled();
  });
});

describe("clearLockout", () => {
  beforeEach(() => {
    hgetallMock.mockReset();
    delMock.mockReset();
    recordMock.mockReset();
    recordMock.mockResolvedValue(undefined);
  });

  it("is a no-op and returns false when there is no state to clear", async () => {
    hgetallMock.mockResolvedValue({});

    const cleared = await clearLockout("user-1", "SUCCESSFUL_LOGIN");

    expect(cleared).toBe(false);
    expect(delMock).not.toHaveBeenCalled();
    expect(recordMock).not.toHaveBeenCalled();
  });

  it("clears the state and records AUTH_LOCKOUT_CLEARED when there is something to clear", async () => {
    hgetallMock.mockResolvedValue({ failures: "2", backoffLevel: "0" });

    const cleared = await clearLockout("user-1", "ADMIN");

    expect(cleared).toBe(true);
    expect(delMock).toHaveBeenCalledWith("lockout:user-1");
    expect(recordMock).toHaveBeenCalledWith({
      action: "AUTH_LOCKOUT_CLEARED",
      targetType: "User",
      targetId: "user-1",
      metadata: { clearedBy: "ADMIN" },
    });
  });

  it("fails open (returns false) when Redis is unavailable", async () => {
    hgetallMock.mockRejectedValue(new Error("connect ECONNREFUSED"));

    const cleared = await clearLockout("user-1", "ADMIN");

    expect(cleared).toBe(false);
    expect(recordMock).not.toHaveBeenCalled();
  });
});
