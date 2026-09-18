import { describe, expect, it, vi } from "vitest";
import { flushLogger, flushStream, resolveAxiomConfig } from "@/lib/logger";

// D6: Axiom só ativa com as duas vars presentes — decisão pura, sem tocar
// pino.transport nem a rede.
describe("resolveAxiomConfig()", () => {
  it("returns undefined when both vars are absent", () => {
    expect(resolveAxiomConfig(undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when only the token is present", () => {
    expect(resolveAxiomConfig("token", undefined)).toBeUndefined();
  });

  it("returns undefined when only the dataset is present", () => {
    expect(resolveAxiomConfig(undefined, "dataset")).toBeUndefined();
  });

  it("returns the pair when both are present", () => {
    expect(resolveAxiomConfig("token", "dataset")).toEqual({
      token: "token",
      dataset: "dataset",
    });
  });
});

describe("flushStream()", () => {
  it("resolves without calling anything when the stream is undefined", async () => {
    await expect(flushStream(undefined)).resolves.toBeUndefined();
  });

  it("resolves once the stream's flush() invokes its callback", async () => {
    const flush = vi.fn((cb: () => void) => cb());

    await flushStream({ flush });

    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe("flushLogger()", () => {
  // Test sempre roda com NODE_ENV=test, onde buildStreams() nunca constrói o
  // stream do Axiom (retorna antes) — o cenário "configurado" é coberto pela
  // combinação resolveAxiomConfig + flushStream acima.
  it("resolves without touching anything when Axiom was never configured", async () => {
    await expect(flushLogger()).resolves.toBeUndefined();
  });
});
