import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GraceLinkState,
  lookupPair,
  lookupServeablePair,
  REFRESH_GRACE_MAX_CHAIN_HOPS,
  refreshGraceKey,
  rememberPair,
} from "@/lib/refreshGrace";
import { hashToken } from "@/lib/token";
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

describe("lookupServeablePair", () => {
  const pairAt = (hop: number) => ({
    accessToken: `access-${hop}`,
    refreshToken: `token-${hop}`,
  });

  /** Um elo por entrada: a chave do token apresentado guarda o par que a rotação emitiu. */
  function serveChain(store: Map<string, string>): void {
    getMock.mockImplementation((key: string) =>
      Promise.resolve(store.get(key) ?? null),
    );
  }

  /** O estado de cada elo, pelo token — o papel que o banco cumpre em produção. */
  function classifyBy(
    states: Record<string, GraceLinkState>,
  ): (refreshTokenHash: string) => Promise<GraceLinkState> {
    return (refreshTokenHash) => {
      const token = Object.keys(states).find(
        (candidate) => hashToken(candidate) === refreshTokenHash,
      );
      return Promise.resolve((token && states[token]) || "DEAD");
    };
  }

  it("serves the presented link's own pair when it is the live tip", async () => {
    serveChain(
      new Map([[refreshGraceKey("hash-a"), JSON.stringify(pairAt(1))]]),
    );

    expect(
      await lookupServeablePair("hash-a", classifyBy({ "token-1": "LIVE" })),
    ).toEqual({ status: "HIT", pair: pairAt(1), hops: 0 });
  });

  it("follows the chain to the live tip when the client is links behind", async () => {
    serveChain(
      new Map([
        [refreshGraceKey("hash-a"), JSON.stringify(pairAt(1))],
        [
          refreshGraceKey(hashToken(pairAt(1).refreshToken)),
          JSON.stringify(pairAt(2)),
        ],
      ]),
    );

    expect(
      await lookupServeablePair(
        "hash-a",
        classifyBy({ "token-1": "ROTATED", "token-2": "LIVE" }),
      ),
    ).toEqual({ status: "HIT", pair: pairAt(2), hops: 1 });
  });

  it("is STALE when the pair belongs to a link that is dead", async () => {
    serveChain(
      new Map([[refreshGraceKey("hash-a"), JSON.stringify(pairAt(1))]]),
    );

    expect(
      await lookupServeablePair("hash-a", classifyBy({ "token-1": "DEAD" })),
    ).toEqual({ status: "STALE", hops: 0 });
  });

  it("is STALE when the chain breaks before a live tip", async () => {
    serveChain(
      new Map([[refreshGraceKey("hash-a"), JSON.stringify(pairAt(1))]]),
    );

    expect(
      await lookupServeablePair("hash-a", classifyBy({ "token-1": "ROTATED" })),
    ).toEqual({ status: "STALE", hops: 0 });
  });

  it("is STALE at the hop cap instead of serving a spent link", async () => {
    const store = new Map([
      [refreshGraceKey("hash-a"), JSON.stringify(pairAt(1))],
    ]);
    const states: Record<string, GraceLinkState> = {};
    for (let hop = 1; hop <= REFRESH_GRACE_MAX_CHAIN_HOPS + 2; hop++) {
      store.set(
        refreshGraceKey(hashToken(pairAt(hop).refreshToken)),
        JSON.stringify(pairAt(hop + 1)),
      );
      states[`token-${hop}`] = "ROTATED";
    }
    serveChain(store);

    expect(await lookupServeablePair("hash-a", classifyBy(states))).toEqual({
      status: "STALE",
      hops: REFRESH_GRACE_MAX_CHAIN_HOPS,
    });
  });

  it("is UNAVAILABLE — never STALE — when the store dies mid-walk", async () => {
    getMock.mockImplementation((key: string) => {
      if (key === refreshGraceKey("hash-a")) {
        return Promise.resolve(JSON.stringify(pairAt(1)));
      }
      return Promise.reject(new Error("redis down"));
    });

    expect(
      await lookupServeablePair("hash-a", classifyBy({ "token-1": "ROTATED" })),
    ).toEqual({ status: "UNAVAILABLE" });
  });

  it("propagates MISS from the first lookup — there is no chain to walk", async () => {
    getMock.mockResolvedValue(null);

    expect(await lookupServeablePair("hash-a", classifyBy({}))).toEqual({
      status: "MISS",
    });
  });

  it("propagates UNAVAILABLE from the first lookup", async () => {
    getMock.mockRejectedValue(new Error("redis down"));

    expect(await lookupServeablePair("hash-a", classifyBy({}))).toEqual({
      status: "UNAVAILABLE",
    });
  });
});
