import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";
import { env } from "@/config/env";

describe("Bordas HTTP — limite de corpo", () => {
  it("should reject a body above JSON_BODY_LIMIT with 413", async () => {
    // JSON_BODY_LIMIT é 100kb; 200 KB de payload passa folgado do teto.
    const oversizedBody = { email: "a".repeat(200 * 1024) };

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send(oversizedBody);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      name: "PayloadTooLargeError",
      code: "PAYLOAD_TOO_LARGE",
      statusCode: 413,
      message: expect.any(String),
      action: expect.any(String),
    });
    // Não vaza o teto configurado nem o erro interno do body-parser.
    expect(JSON.stringify(response.body)).not.toContain(env.JSON_BODY_LIMIT);
  });

  it("should still accept a normal-sized body", async () => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "quem-nao-existe@example.com", password: "Senha123!" });

    expect(response.status).not.toBe(413);
  });
});
