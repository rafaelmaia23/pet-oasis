import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";

describe("GET /openapi.json", () => {
  it("should be public (no token) and return 200 with JSON", async () => {
    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("should be a valid OpenAPI 3.1 document served under /api/v1", async () => {
    const { body } = await request(app).get("/openapi.json");

    expect(body.openapi).toBe("3.1.0");
    expect(body.info?.title).toBe("Pet Oasis API");
    expect(body.servers?.[0]?.url).toBe("/api/v1");
    expect(body.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("should document representative public and protected routes", async () => {
    const { body } = await request(app).get("/openapi.json");

    expect(body.paths?.["/auth/login"]?.post).toBeDefined();
    expect(body.paths?.["/users"]?.get).toBeDefined();
    expect(body.paths?.["/roles"]?.get).toBeDefined();
    expect(body.paths?.["/breeds"]?.get).toBeDefined();

    // login é público (security: []); /users herda o bearer global
    expect(body.paths["/auth/login"].post.security).toEqual([]);
    expect(body.paths["/users"].get.security).toBeUndefined();
    // a vitrine do catálogo (9.1) é pública — sem isto o Scalar mostraria
    // cadeado e o "try it" exigiria token numa rota que responde sem ele
    expect(body.paths["/breeds"].get.security).toEqual([]);
  });

  it("should not leak sensitive fields anywhere in the document", async () => {
    const { text } = await request(app).get("/openapi.json");

    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain("refreshTokenHash");
  });
});
