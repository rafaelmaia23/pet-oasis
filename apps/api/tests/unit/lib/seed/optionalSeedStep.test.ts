import { beforeEach, describe, expect, it } from "vitest";
import { logBuffer } from "@/lib/logBuffer";
import { runOptionalSeedStep } from "@/lib/seed/optionalSeedStep";

/** O stream do pino é síncrono aqui (buffer em memória), mas a escrita passa
 *  pelo event loop — um tick basta para a linha estar disponível. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * O passo opcional do seed é fail-open (10.3): dado de demonstração que não
 * semeia vira uma linha de log, nunca o boot inteiro fora do ar. É a única
 * parte da issue que vive em TypeScript e não no Docker — o resto (o
 * entrypoint continuar parando no dado de referência) é verificação manual.
 */
describe("runOptionalSeedStep", () => {
  beforeEach(() => {
    logBuffer.clear();
  });

  it("should hand back what the step returned when it succeeds", async () => {
    const outcome = await runOptionalSeedStep("demo-user", async () => 7);

    expect(outcome).toEqual({ ok: true, value: 7 });
  });

  it("should stay silent when the step succeeds", async () => {
    await runOptionalSeedStep("demo-user", async () => 7);
    await flush();

    expect(logBuffer.list()).toHaveLength(0);
  });

  it("should resolve instead of throwing when the step fails", async () => {
    const outcome = await runOptionalSeedStep("fake-catalog", async () => {
      throw new Error("EACCES: permission denied, open '/app/uploads/x.webp'");
    });

    expect(outcome).toEqual({ ok: false });
  });

  it("should log the failure at error level, naming the step and the cause", async () => {
    await runOptionalSeedStep("fake-catalog", async () => {
      throw new Error("EACCES: permission denied, open '/app/uploads/x.webp'");
    });
    await flush();

    const [line] = logBuffer.list() as { level: number; step: string }[];

    expect(line).toMatchObject({ level: 50, step: "fake-catalog" });
    expect(JSON.stringify(line)).toContain("EACCES: permission denied");
  });

  it("should let the next step run after one has failed", async () => {
    const ran: string[] = [];

    await runOptionalSeedStep("fake-users", async () => {
      throw new Error("falhou");
    });
    await runOptionalSeedStep("fake-catalog", async () => {
      ran.push("fake-catalog");
    });

    expect(ran).toEqual(["fake-catalog"]);
  });
});
