import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";
import { env } from "@/config/env";

describe("Bordas HTTP — helmet", () => {
  it("should send the security headers on an API response", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  // O bundle do Scalar é servido pela própria origem (D3) — a CSP global pode
  // manter `script-src 'self'` sem exceção nenhuma para CDN.
  it("should keep script-src strict (no CDN allowlisted) on the API", async () => {
    const { headers } = await request(app).get("/api/v1/status");
    const csp = headers["content-security-policy"] as string;

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("cdn.jsdelivr.net");
  });

  // A folga de style-src que a UI do Scalar exige fica escopada na doc; a API
  // não herda nada disso.
  it("should not relax style-src on API routes", async () => {
    const { headers } = await request(app).get("/api/v1/status");
    const csp = headers["content-security-policy"] as string;

    expect(csp).not.toContain("'unsafe-inline'");
  });

  it("should relax style-src only on the docs routes", async () => {
    const { headers } = await request(app).get("/reference");
    const csp = headers["content-security-policy"] as string;

    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    expect(csp).toContain("script-src 'self'");
  });

  // A UI do Scalar é iniciada por um <script> INLINE. Sem nonce, `script-src
  // 'self'` o bloquearia e a página viria 200 com a UI em branco — por isso o
  // curl não basta para validar esta rota.
  it("should authorize the inline init script with a matching nonce", async () => {
    const { headers, text } = await request(app).get("/reference");
    const csp = headers["content-security-policy"] as string;

    const cspNonce = /script-src[^;]*'nonce-([^']+)'/.exec(csp)?.[1];
    expect(cspNonce).toBeDefined();
    expect(text).toContain(`nonce="${cspNonce}"`);
    expect(text).toMatch(
      new RegExp(`<script[^>]*nonce="${cspNonce}"[^>]*>\\s*Scalar\\.`),
    );
  });

  it("should use a fresh nonce on every request", async () => {
    const nonceOf = (csp: string | undefined) =>
      /script-src[^;]*'nonce-([^']+)'/.exec(csp ?? "")?.[1];

    const first = await request(app).get("/reference");
    const second = await request(app).get("/reference");

    expect(nonceOf(first.headers["content-security-policy"])).not.toBe(
      nonceOf(second.headers["content-security-policy"]),
    );
  });
});

describe("Bordas HTTP — CORS", () => {
  it("should answer a preflight from an allowed origin with credentials", async () => {
    const response = await request(app)
      .options("/api/v1/auth/login")
      .set("Origin", env.APP_URL)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBe(env.APP_URL);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("should not send CORS headers to an origin outside the allowlist", async () => {
    const response = await request(app)
      .get("/api/v1/status")
      .set("Origin", "https://evil.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    // A origem não permitida não é um erro do servidor — o navegador é quem
    // bloqueia. A request em si segue normalmente.
    expect(response.status).toBe(200);
  });

  it("should let requests without an Origin through (curl, Bruno, tests)", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.status).toBe(200);
  });
});

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
