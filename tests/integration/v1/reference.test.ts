import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";
import { SCALAR_BUNDLE_PATH } from "@/docs/reference";

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

  // D3 — o bundle é servido pela própria origem, para a CSP do helmet poder
  // manter `script-src 'self'` sem quebrar a UI (e p/ funcionar sem internet).
  it("should load the Scalar bundle from this origin, not from a CDN", async () => {
    const { text } = await request(app).get("/reference");

    expect(text).toContain(`src="${SCALAR_BUNDLE_PATH}"`);
    expect(text).not.toContain("cdn.jsdelivr.net");
  });

  // Sem estes flags a página baixaria webfonts de fonts.scalar.com e mandaria
  // telemetria — terceiros que a CSP bloquearia. Desligados na origem, em vez
  // de liberados na CSP.
  it("should render without third-party fonts or telemetry", async () => {
    const { text } = await request(app).get("/reference");

    expect(text).toMatch(/"withDefaultFonts":\s*false/);
    expect(text).toMatch(/"telemetry":\s*false/);
  });
});

describe(`GET ${SCALAR_BUNDLE_PATH}`, () => {
  it("should serve the self-hosted bundle as JavaScript", async () => {
    const response = await request(app).get(SCALAR_BUNDLE_PATH);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/javascript/);
    expect(response.headers["cache-control"]).toMatch(/max-age=\d+/);
  });
});
