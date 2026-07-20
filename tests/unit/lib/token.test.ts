import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashToken } from "@/lib/token";

describe("Token", () => {
  describe("generateOpaqueToken()", () => {
    it("should return a 64-character hex string", () => {
      const token = generateOpaqueToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate a different token on each call", () => {
      const tokenA = generateOpaqueToken();
      const tokenB = generateOpaqueToken();
      expect(tokenA).not.toBe(tokenB);
    });
  });

  describe("hashToken()", () => {
    it("should return a 64-character hex sha256 digest", () => {
      const hash = hashToken("some-opaque-token");
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should be deterministic for the same input", () => {
      const hashA = hashToken("same-token");
      const hashB = hashToken("same-token");
      expect(hashA).toBe(hashB);
    });

    it("should produce different hashes for different inputs", () => {
      const hashA = hashToken("token-a");
      const hashB = hashToken("token-b");
      expect(hashA).not.toBe(hashB);
    });
  });
});
