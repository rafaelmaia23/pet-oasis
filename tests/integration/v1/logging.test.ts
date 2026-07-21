import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";
import { REQUEST_ID_HEADER } from "@/lib/requestContext";

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
