import { buildEmployee } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/app";
import { logBuffer } from "@/lib/logBuffer";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ send: sendMock }));

/** Employee com read:log (buffer em memória). */
function buildLogReader() {
  return buildEmployee({ roleNames: ["attendant"], grants: ["read:log"] });
}

describe("GET /api/v1/logs/recent", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await clearDatabase();
    await flushRedis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 401 without an access token", async () => {
    const response = await request(app).get("/api/v1/logs/recent");
    expect(response.status).toBe(401);
  });

  it("should return 403 without read:log", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/logs/recent")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 200 with an enveloped buffer and volatility meta", async () => {
    const reader = await buildLogReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get("/api/v1/logs/recent")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.meta).toMatchObject({
      perProcess: true,
      volatile: true,
    });
    expect(response.body.meta.count).toBe(response.body.data.length);
    expect(typeof response.body.meta.capacity).toBe("number");
  });

  it("should cap the result with ?limit=", async () => {
    const reader = await buildLogReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get("/api/v1/logs/recent?limit=1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeLessThanOrEqual(1);
    expect(response.body.meta.count).toBe(response.body.data.length);
  });

  it("should return entries newest-first", async () => {
    const reader = await buildLogReader();
    const token = await loginAs(reader.email, reader.password);

    // Two sentinels: B pushed after A, so B is newer and must appear earlier.
    logBuffer.clear();
    logBuffer.push({ msg: "sentinel-A", marker: "A" });
    logBuffer.push({ msg: "sentinel-B", marker: "B" });

    const response = await request(app)
      .get("/api/v1/logs/recent")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const markers = response.body.data
      .map((entry: { marker?: string }) => entry.marker)
      .filter((m: string | undefined): m is string => m === "A" || m === "B");
    expect(markers.indexOf("B")).toBeLessThan(markers.indexOf("A"));
  });
});
