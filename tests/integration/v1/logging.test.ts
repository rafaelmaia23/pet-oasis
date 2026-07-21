import { buildCustomer } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import app from "@/app";
import { logBuffer } from "@/lib/logBuffer";
import { REQUEST_ID_HEADER } from "@/lib/requestContext";

/** A escrita no stream passa pelo event loop; um tick basta. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Linhas de access log (o pino-http marca a request completada). */
function accessLines() {
  return logBuffer.list().filter((entry) => "responseTime" in entry);
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
