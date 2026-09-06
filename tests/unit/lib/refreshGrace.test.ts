import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupPair, refreshGraceKey, rememberPair } from "@/lib/refreshGrace";
import { REFRESH_GRACE_WINDOW_MS } from "@/modules/auth/auth.constants";

const { getMock, setMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
  redis: { get: getMock, set: setMock },
}));

const PAIR = { accessToken: "access", refreshToken: "refresh" };

beforeEach(() => {
  getMock.mockReset();
  setMock.mockReset();
  setMock.mockResolvedValue("OK");
});

describe("refreshGraceKey", () => {
  it("keys by the hash of the presented token, never by the token itself", () => {
    expect(refreshGraceKey("abc123")).toBe("refresh:grace:abc123");
  });
});

describe("rememberPair", () => {
  it("writes the pair under the window's TTL", async () => {
    await rememberPair("hash", PAIR);

    expect(setMock).toHaveBeenCalledWith(
      "refresh:grace:hash",
      JSON.stringify(PAIR),
      "PX",
      REFRESH_GRACE_WINDOW_MS,
    );
  });

  it("swallows a store failure — the write is best-effort", async () => {
    setMock.mockRejectedValue(new Error("redis down"));

    await expect(rememberPair("hash", PAIR)).resolves.toBeUndefined();
  });
});

describe("lookupPair", () => {
  it("returns the pair when the key is there", async () => {
    getMock.mockResolvedValue(JSON.stringify(PAIR));

    expect(await lookupPair("hash")).toEqual({ status: "HIT", pair: PAIR });
  });

  it("returns MISS when the key is absent and the store answers", async () => {
    getMock.mockResolvedValue(null);

    expect(await lookupPair("hash")).toEqual({ status: "MISS" });
  });

  it("returns MISS when the stored value is not a usable pair", async () => {
    getMock.mockResolvedValue("{not json");

    expect(await lookupPair("hash")).toEqual({ status: "MISS" });
  });

  it("returns UNAVAILABLE when the store itself fails", async () => {
    getMock.mockRejectedValue(new Error("redis down"));

    expect(await lookupPair("hash")).toEqual({ status: "UNAVAILABLE" });
  });
});
