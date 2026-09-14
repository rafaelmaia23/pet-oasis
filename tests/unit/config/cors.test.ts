import { describe, expect, it } from "vitest";
import { parseAllowedOrigins } from "@/config/cors";

describe("parseAllowedOrigins()", () => {
  it("should build the allowlist only from the explicit CSV", () => {
    const origins = parseAllowedOrigins(
      "https://one.example, https://two.example/",
    );

    expect([...origins]).toEqual([
      "https://one.example",
      "https://two.example",
    ]);
  });

  it("should yield an empty allowlist when the variable is unset or blank", () => {
    expect(parseAllowedOrigins(undefined).size).toBe(0);
    expect(parseAllowedOrigins("").size).toBe(0);
    expect(parseAllowedOrigins(" , ").size).toBe(0);
  });
});
