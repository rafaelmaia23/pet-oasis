import { describe, expect, it } from "vitest";
import { generateOpaqueRefreshToken, hashRefreshToken } from "@/lib/token";

describe("Token", () => {
  describe("generateOpaqueRefreshToken()", () => {
    it("should return a 64-character hex string", () => {
      const token = generateOpaqueRefreshToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate a different token on each call", () => {
      const tokenA = generateOpaqueRefreshToken();
      const tokenB = generateOpaqueRefreshToken();
      expect(tokenA).not.toBe(tokenB);
    });
  });

  describe("hashRefreshToken()", () => {
    it("should return a 64-character hex sha256 digest", () => {
      const hash = hashRefreshToken("some-opaque-token");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should be deterministic for the same input", () => {
      const hashA = hashRefreshToken("same-token");
      const hashB = hashRefreshToken("same-token");
      expect(hashA).toBe(hashB);
    });

    it("should produce different hashes for different inputs", () => {
      const hashA = hashRefreshToken("token-a");
      const hashB = hashRefreshToken("token-b");
      expect(hashA).not.toBe(hashB);
    });
  });
});
