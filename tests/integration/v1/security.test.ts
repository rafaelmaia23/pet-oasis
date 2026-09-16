import { buildCustomer } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/app";
import { env } from "@/config/env";
import {
  ACCESS_TOKEN_ALGORITHM,
  ACCESS_TOKEN_AUDIENCE,
  ACCESS_TOKEN_ISSUER,
} from "@/lib/accessToken";

// A allowlist de CORS sai **só** de `CORS_ALLOWED_ORIGINS` (10.11) — nada entra
// por inércia, nem a `APP_URL`. `vi.hoisted` roda antes dos imports, então as
// duas variáveis já estão fixadas quando `@/config/env` é lido — o teste não
// depende do `.env.test` de cada máquina, e as duas origens são distintas por
// construção.
const { allowedOrigin, appUrl } = vi.hoisted(() => {
  const allowedOrigin = "https://browser-client.example";
  const appUrl = "https://front.example";
  process.env.CORS_ALLOWED_ORIGINS = allowedOrigin;
  process.env.APP_URL = appUrl;
  return { allowedOrigin, appUrl };
});

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
      .set("Origin", allowedOrigin)
      .set("Access-Control-Request-Method", "POST");

    expect(response.headers["access-control-allow-origin"]).toBe(allowedOrigin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  // A URL pública do cliente (`APP_URL`) é o front, e o front fala com a API
  // pelo servidor (BFF) — nunca pelo navegador. Entrar na allowlist por ser
  // "quem chama" seria permissão concedida a um consumidor que não existe.
  it("should not grant APP_URL an origin by inertia", async () => {
    const response = await request(app)
      .get("/api/v1/status")
      .set("Origin", appUrl);

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.status).toBe(200);
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

  it("should not apply JSON_BODY_LIMIT to a multipart body", async () => {
    // Os dois tetos são independentes, e é a primeira coisa que alguém vai
    // suspeitar quando um upload de 3 MB falhar por outro motivo: `express.json`
    // só age em `application/json`, então o teto de 100 kb não alcança
    // multipart. Quem limita upload é o multer — o 413 dele está provado em
    // `product.image.test.ts`, junto do resto do contrato da rota de imagem.
    //
    // Mesma rota e mesmo tamanho do primeiro caso deste bloco: só o
    // `Content-Type` muda, e com ele o resultado.
    const response = await request(app)
      .post("/api/v1/auth/login")
      .field("email", "a".repeat(200 * 1024));

    // 422 e não 413: o corpo atravessou o body-parser intacto e morreu na
    // validação do schema, que é o que se queria provar.
    expect(response.status).toBe(422);
  });
});

// Endurecimento do JWT (10.10) visto de fora: um token forjado com o **mesmo
// segredo** e uma só claim fora do lugar morre no `authenticate` com o mesmo
// 401 genérico de token inválido — o cliente não fica sabendo qual claim foi.
// Cada peça do contrato tem o caso próprio na lib; aqui o que se prova é que a
// fronteira HTTP honra o contrato, e que o caminho feliz sobreviveu a ele.
describe("Bordas HTTP — JWT", () => {
  afterEach(async () => {
    await clearDatabase();
    await flushRedis();
  });

  function forge(userId: string, options: jwt.SignOptions): string {
    return jwt.sign({ sub: userId }, env.JWT_SECRET, {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      issuer: ACCESS_TOKEN_ISSUER,
      audience: ACCESS_TOKEN_AUDIENCE,
      expiresIn: "15m",
      ...options,
    });
  }

  async function whoAmI(token: string) {
    return request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);
  }

  it("should accept the token the login issued", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await whoAmI(token);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(user.id);
  });

  it.each([
    ["another algorithm", { algorithm: "HS512" as const }],
    ["another issuer", { issuer: "someone-else" }],
    ["another audience", { audience: "some-other-service" }],
  ])(
    "should refuse a token signed with our secret but for %s",
    async (_label, options) => {
      const user = await buildCustomer();

      const response = await whoAmI(forge(user.id, options));

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: "Token de autenticação inválido ou expirado",
        code: "UNAUTHORIZED",
      });
    },
  );

  // A consequência de implantar a 10.10: o token emitido pela versão anterior
  // não carrega `iss`/`aud`, então morre no deploy. Com 15 minutos de vida a
  // janela é curta, e o `refresh` recompõe o par — mas é preciso dizê-lo.
  it("should refuse a token issued before the hardening (no iss/aud)", async () => {
    const user = await buildCustomer();
    const legacyToken = jwt.sign({ sub: user.id }, env.JWT_SECRET, {
      algorithm: ACCESS_TOKEN_ALGORITHM,
      expiresIn: "15m",
    });

    const response = await whoAmI(legacyToken);

    expect(response.status).toBe(401);
  });
});
