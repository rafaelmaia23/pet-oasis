import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("Password", () => {
  describe("hashPassword()", () => {
    it("should return a hashed password", async () => {
      const password = "mysecretpassword";
      const hash = await hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(0);
      expect(hash).toMatch(/^\$2[aby]\$.{56}$/);
    });
  });

  describe("verifyPassword()", () => {
    it("should return true for a valid password", async () => {
      const password = "mysecretpassword";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it("should return false for an invalid password", async () => {
      const password = "mysecretpassword";
      const hash = await hashPassword(password);
      const isValid = await verifyPassword("wrongpassword", hash);
      expect(isValid).toBe(false);
    });

    it("should return false when comparing against a different hash", async () => {
      await hashPassword("password1");
      const hash2 = await hashPassword("password2");
      const isValid = await verifyPassword("password1", hash2);
      expect(isValid).toBe(false);
    });

    it("should generate different hashes for the same password", async () => {
      const hash1 = await hashPassword("samepassword");
      const hash2 = await hashPassword("samepassword");
      expect(hash1).not.toBe(hash2); // salt garante isso
    });
  });
});
