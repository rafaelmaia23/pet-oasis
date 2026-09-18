import { beforeEach, describe, expect, it } from "vitest";
import { logBuffer } from "@/lib/logBuffer";
import { logger } from "@/lib/logger";
import { runWithRequestContext } from "@/lib/requestContext";

/** O stream do pino é síncrono aqui (buffer em memória), mas a escrita passa
 *  pelo event loop — um tick basta para a linha estar disponível. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("logger", () => {
  beforeEach(() => {
    logBuffer.clear();
  });

  it("should write to the ring buffer", async () => {
    logger.info("linha de teste");
    await flush();

    expect(logBuffer.list()).toHaveLength(1);
    expect(logBuffer.list()[0]).toMatchObject({ msg: "linha de teste" });
  });

  // Política §5.1 — a lista é única e vale para todo destino.
  it.each([
    ["password", { password: "SenhaSecreta1!" }],
    ["currentPassword", { currentPassword: "SenhaSecreta1!" }],
    ["newPassword", { newPassword: "SenhaSecreta1!" }],
    ["passwordHash", { passwordHash: "$2b$10$abcdef" }],
    ["token", { token: "opaco-123" }],
    ["accessToken", { accessToken: "jwt.abc.def" }],
    ["refreshToken", { refreshToken: "opaco-456" }],
  ])("should redact %s at the top level", async (_field, payload) => {
    logger.info(payload, "com campo proibido");
    await flush();

    const line = JSON.stringify(logBuffer.list()[0]);

    expect(line).not.toContain("SenhaSecreta1!");
    expect(line).not.toContain("$2b$10$abcdef");
    expect(line).not.toContain("opaco-123");
    expect(line).not.toContain("jwt.abc.def");
    expect(line).not.toContain("opaco-456");
  });

  it("should redact forbidden fields nested one level deep", async () => {
    logger.info({ user: { password: "SenhaSecreta1!" } }, "aninhado");
    await flush();

    expect(JSON.stringify(logBuffer.list()[0])).not.toContain("SenhaSecreta1!");
  });

  it("should redact the authorization and cookie request headers", async () => {
    logger.info(
      {
        req: {
          headers: {
            authorization: "Bearer jwt.abc.def",
            cookie: "refreshToken=opaco-456",
          },
        },
      },
      "headers",
    );
    await flush();

    const line = JSON.stringify(logBuffer.list()[0]);

    expect(line).not.toContain("jwt.abc.def");
    expect(line).not.toContain("opaco-456");
  });

  it("should correlate every line with the requestId from the store", async () => {
    await runWithRequestContext({ requestId: "req-abc" }, async () => {
      logger.info("de dentro do request");
      await flush();
    });

    expect(logBuffer.list()[0]).toMatchObject({ requestId: "req-abc" });
  });

  it("should omit requestId when logging outside a request", async () => {
    logger.info("de fora do request");
    await flush();

    expect(logBuffer.list()[0]).not.toHaveProperty("requestId");
  });

  it("should tag lines from a child logger with its module", async () => {
    logger.child({ module: "auth" }).info("evento do módulo");
    await flush();

    expect(logBuffer.list()[0]).toMatchObject({ module: "auth" });
  });
});
