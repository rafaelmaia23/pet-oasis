import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";

describe("GET /api/v1/status", () => {
  it("should return 200 with database status", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("updated_at");
    expect(response.body).toHaveProperty("dependencies.database");
  });

  it("should return a valid ISO date in updated_at", async () => {
    const response = await request(app).get("/api/v1/status");

    const updatedAt = new Date(response.body.updated_at);

    expect(updatedAt).toBeInstanceOf(Date);
    expect(Number.isNaN(updatedAt.getTime())).toBe(false);
  });

  it("should return database version as a string", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(typeof response.body.dependencies.database.version).toBe("string");
    expect(response.body.dependencies.database.version.length).toBeGreaterThan(
      0,
    );
  });

  it("should return max_connections as a number", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(typeof response.body.dependencies.database.max_connections).toBe(
      "number",
    );
    expect(response.body.dependencies.database.max_connections).toBeGreaterThan(
      0,
    );
  });

  it("should return opened_connections as a number", async () => {
    const response = await request(app).get("/api/v1/status");

    expect(typeof response.body.dependencies.database.opened_connections).toBe(
      "number",
    );
    expect(
      response.body.dependencies.database.opened_connections,
    ).toBeGreaterThanOrEqual(0);
  });
});
