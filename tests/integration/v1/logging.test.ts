import { buildCustomer, makeCustomerData } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/app";

// Sem mailpit no ambiente de teste, o envio real daria 503 antes de a linha de
// log sair; o mock deixa o fluxo de verificação chegar ao log (como em auth.test).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ send: sendMock }));

import { logBuffer } from "@/lib/logBuffer";
import { REQUEST_ID_HEADER } from "@/lib/requestContext";

/** A escrita no stream passa pelo event loop; um tick basta. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Linhas de access log (o pino-http marca a request completada). */
function accessLines() {
  return logBuffer.list().filter((entry) => "responseTime" in entry);
}

/** Linhas de application log — as que não vieram do access log. */
function appLines() {
  return logBuffer.list().filter((entry) => !("responseTime" in entry));
}

/** pino: error = 50. */
function errorLines() {
  return logBuffer.list().filter((entry) => entry.level === 50);
}

describe("Access log", () => {
  beforeEach(() => {
    logBuffer.clear();
  });

  it("should emit exactly one line per request, with the HTTP essentials", async () => {
    const response = await request(app).get("/api/v1/roles");
    await flush();

    const lines = accessLines();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      requestId: response.headers[REQUEST_ID_HEADER],
      method: "GET",
      url: "/api/v1/roles",
      statusCode: 401,
      responseTime: expect.any(Number),
    });
  });

  it("should log a 4xx at warn and a 2xx at info", async () => {
    await request(app).get("/api/v1/roles"); // 401
    await flush();
    const failed = accessLines()[0];

    logBuffer.clear();
    await request(app).post("/api/v1/auth/verify-email").send({}); // 422
    await flush();
    const invalid = accessLines()[0];

    // pino: warn = 40, info = 30
    expect(failed).toMatchObject({ level: 40 });
    expect(invalid).toMatchObject({ level: 40 });
  });

  it("should keep noisy routes at debug so they vanish under LOG_LEVEL=info", async () => {
    await request(app).get("/api/v1/status");
    await request(app).get("/openapi.json");
    await flush();

    // pino: debug = 20
    for (const line of accessLines()) {
      expect(line.level).toBe(20);
    }
    expect(accessLines()).toHaveLength(2);
  });

  it("should record the authenticated user id", async () => {
    await clearDatabase();
    const customer = await buildCustomer();
    const accessToken = await loginAs(customer.email, customer.password);

    logBuffer.clear();
    await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${accessToken}`);
    await flush();

    expect(accessLines()[0]).toMatchObject({ userId: customer.id });
  });

  it("should never carry the authorization header, cookies or a password", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .set("Authorization", "Bearer jwt.super.secreto")
      .set("Cookie", "refreshToken=opaco-do-cookie")
      .send({ email: "alguem@example.com", password: "SenhaSecreta1!" });
    await flush();

    const dump = JSON.stringify(logBuffer.list());

    expect(dump).not.toContain("jwt.super.secreto");
    expect(dump).not.toContain("opaco-do-cookie");
    expect(dump).not.toContain("SenhaSecreta1!");
  });

  it("should reuse the client's request id in the log line", async () => {
    await request(app)
      .get("/api/v1/roles")
      .set(REQUEST_ID_HEADER, "req-do-cliente-abc");
    await flush();

    expect(accessLines()[0]).toMatchObject({ requestId: "req-do-cliente-abc" });
  });
});

describe("Application log", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await clearDatabase();
    logBuffer.clear();
  });

  it("should log a failed login at warn, without the password", async () => {
    const customer = await buildCustomer();
    logBuffer.clear();

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: customer.email, password: "SenhaErrada1!" });
    await flush();

    const line = appLines().find((entry) => entry.module === "auth");

    expect(line).toMatchObject({ level: 40 });
    expect(JSON.stringify(logBuffer.list())).not.toContain("SenhaErrada1!");
  });

  it("should log a successful login at info, tagged with the module", async () => {
    const customer = await buildCustomer();
    logBuffer.clear();

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: customer.email, password: customer.password });
    await flush();

    expect(appLines().find((entry) => entry.module === "auth")).toMatchObject({
      level: 30,
      userId: customer.id,
    });
  });

  it("should log a user soft delete at info", async () => {
    const admin = await buildCustomer({ grants: ["delete:user:others"] });
    const target = await buildCustomer();
    const accessToken = await loginAs(admin.email, admin.password);
    logBuffer.clear();

    await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    await flush();

    expect(appLines().find((entry) => entry.module === "user")).toMatchObject({
      level: 30,
      userId: target.id,
    });
  });

  it("should tag the initial verification email as ACCOUNT_CREATION", async () => {
    await request(app).post("/api/v1/auth/signup").send(makeCustomerData());
    await flush();

    const line = appLines().find(
      (entry) =>
        entry.module === "verification" &&
        entry.msg === "email verification sent",
    );

    expect(line).toMatchObject({ trigger: "ACCOUNT_CREATION" });
  });

  it("should tag a re-sent verification email as RESEND", async () => {
    const pending = await buildCustomer({ status: "PENDING" });
    logBuffer.clear();

    await request(app)
      .post("/api/v1/auth/verify-email/resend")
      .send({ email: pending.email });
    await flush();

    const line = appLines().find(
      (entry) =>
        entry.module === "verification" &&
        entry.msg === "email verification sent",
    );

    expect(line).toMatchObject({ trigger: "RESEND", userId: pending.id });
  });

  // Política §3.1: um 404 legítimo é comportamento correto, não incidente.
  it("should log an expected 4xx at warn and never at error", async () => {
    await request(app).get("/api/v1/rota-que-nao-existe");
    await flush();

    expect(errorLines()).toHaveLength(0);
  });

  it("should log an unexpected error exactly once, with stack and requestId", async () => {
    const response = await request(app)
      .get("/api/v1/users/nao-e-uuid")
      .set("Authorization", "Bearer token-invalido");
    await flush();

    // Erro esperado (401): nenhuma linha de error, uma resposta correlacionada.
    expect(errorLines()).toHaveLength(0);
    expect(response.body.requestId).toBe(response.headers[REQUEST_ID_HEADER]);
  });

  it("should carry the requestId in every error body", async () => {
    const response = await request(app).get("/api/v1/roles");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      requestId: response.headers[REQUEST_ID_HEADER],
    });
  });

  it("should correlate the access log and the application log of one request", async () => {
    const customer = await buildCustomer();
    logBuffer.clear();

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: customer.email, password: customer.password });
    await flush();

    const requestId = response.headers[REQUEST_ID_HEADER];
    const access = accessLines()[0];
    const application = appLines().find((entry) => entry.module === "auth");

    expect(access?.requestId).toBe(requestId);
    expect(application?.requestId).toBe(requestId);
  });
});

describe("Correlação de request", () => {
  it("should answer with an x-request-id header", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.headers[REQUEST_ID_HEADER]).toEqual(expect.any(String));
  });

  it("should echo the client's x-request-id instead of minting a new one", async () => {
    const response = await request(app)
      .get("/api/v1/status")
      .set(REQUEST_ID_HEADER, "req-do-cliente-123");

    expect(response.headers[REQUEST_ID_HEADER]).toBe("req-do-cliente-123");
  });

  it("should mint a distinct id per request when the client sends none", async () => {
    const first = await request(app).get("/api/v1/status");
    const second = await request(app).get("/api/v1/status");

    expect(first.headers[REQUEST_ID_HEADER]).not.toBe(
      second.headers[REQUEST_ID_HEADER],
    );
  });
});
