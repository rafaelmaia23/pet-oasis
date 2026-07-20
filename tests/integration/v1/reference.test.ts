import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";

describe("GET /reference", () => {
  it("should be public (no token) and return 200 with HTML", async () => {
    const response = await request(app).get("/reference");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/text\/html/);
  });

  it("should render the Scalar UI pointing at the openapi spec", async () => {
    const { text } = await request(app).get("/reference");

    expect(text).toContain("/openapi.json");
    expect(text.toLowerCase()).toContain("scalar");
  });
});
