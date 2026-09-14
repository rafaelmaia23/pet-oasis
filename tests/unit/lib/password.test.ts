import { describe, expect, it } from "vitest";
import {
  hashPassword,
  simulatePasswordVerification,
  verifyPassword,
} from "@/lib/password";

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

  describe("simulatePasswordVerification()", () => {
    it("should cost about as much as rejecting a wrong password against a real hash", async () => {
      // O oráculo de tempo do login (10.9): se o caminho sem conta não paga o
      // bcrypt, o atacante distingue email existente de inexistente pelo
      // relógio. Este é o seam onde a propriedade é observável — na fronteira
      // HTTP, o custo 4 da suíte some debaixo do ruído da rede. Amostras
      // intercaladas e medianas; a razão é larga porque guarda contra a ordem
      // de grandeza (bcrypt versus nada), não contra microssegundos.
      const realHash = await hashPassword("the-real-password");
      const samples = 20;
      const realMs: number[] = [];
      const simulatedMs: number[] = [];

      async function time(fn: () => Promise<unknown>): Promise<number> {
        const startedAt = process.hrtime.bigint();
        await fn();
        return Number(process.hrtime.bigint() - startedAt) / 1e6;
      }

      for (let i = 0; i < samples; i++) {
        realMs.push(await time(() => verifyPassword("wrong", realHash)));
        simulatedMs.push(
          await time(() => simulatePasswordVerification("wrong")),
        );
      }

      function median(values: number[]): number {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      }

      expect(median(simulatedMs)).toBeGreaterThan(median(realMs) / 2);
      expect(median(simulatedMs)).toBeLessThan(median(realMs) * 2);
    });

    it("should never claim a match", async () => {
      await expect(simulatePasswordVerification("anything")).resolves.toBe(
        false,
      );
    });
  });
});
