import { OPAQUE_TOKEN_LENGTH } from "@pet-oasis/api-contracts/auth";
import { describe, expect, it } from "vitest";
import { generateOpaqueToken, hashToken } from "@/lib/token";

describe("Token", () => {
  describe("generateOpaqueToken()", () => {
    it("should return a 64-character hex string", () => {
      const token = generateOpaqueToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    // O contrato fixa o comprimento que atravessa a rede (é o `.max()` dos
    // campos `token`); a entropia é da API. Este é o vínculo entre os dois:
    // um gerador mais largo teria todo token recusado no schema.
    it("should emit exactly the length the contract accepts", () => {
      expect(generateOpaqueToken()).toHaveLength(OPAQUE_TOKEN_LENGTH);
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
