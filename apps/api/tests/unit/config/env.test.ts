import { describe, expect, it } from "vitest";
import { timespanSchema } from "@/config/env";

/**
 * O prazo de validade do access token é validado **no limite do env** (11.16),
 * onde já vivem todas as outras restrições de boot: uma string que o `ms` não
 * entende derruba o processo com a mesma mensagem das demais, e quem lê
 * `env.JWT_EXPIRES_IN` recebe um valor que o parser já aceitou — sem `as`.
 */
describe("timespanSchema", () => {
  it("accepts the formats the ms parser understands, unchanged", () => {
    for (const value of ["15m", "7d", "900s", "1h"]) {
      expect(timespanSchema.parse(value)).toBe(value);
    }
  });

  it("rejects a string the parser cannot read", () => {
    expect(timespanSchema.safeParse("banana").success).toBe(false);
    expect(timespanSchema.safeParse("").success).toBe(false);
  });

  it("rejects a timespan that is not positive", () => {
    // Um prazo de zero ou negativo assinaria um token nascido expirado.
    expect(timespanSchema.safeParse("0s").success).toBe(false);
    expect(timespanSchema.safeParse("-5m").success).toBe(false);
  });
});
