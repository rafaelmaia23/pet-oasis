import { buildEmployee } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { auditLogViews } from "@/modules/audit-log/audit-log.presenter";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ send: sendMock }));

type SeedRow = {
  action?: string;
  targetType?: string;
  targetId?: string | null;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  createdAt?: Date;
};

async function seedAudit(row: SeedRow = {}) {
  return prisma.auditLog.create({
    data: {
      action: row.action ?? "USER_BANNED",
      targetType: row.targetType ?? "User",
      targetId: row.targetId ?? null,
      actorId: row.actorId ?? null,
      ip: row.ip ?? "192.168.1.42",
      userAgent: row.userAgent ?? "vitest",
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
    },
  });
}

/** Employee que lê a trilha mas vê IP mascarado (sem read:audit-log:full). */
function buildMaskedReader() {
  return buildEmployee({
    roleNames: ["attendant"],
    grants: ["read:audit-log"],
  });
}

/** Manager: tem read:audit-log:full (IP inteiro). */
function buildFullReader() {
  return buildEmployee({ roleNames: ["manager"] });
}

describe("GET /api/v1/audit-logs", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await clearDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return 401 without an access token", async () => {
    const response = await request(app).get("/api/v1/audit-logs");
    expect(response.status).toBe(401);
  });

  it("should return 403 without read:audit-log", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/audit-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 200 and the enveloped, view-shaped trail", async () => {
    await seedAudit();
    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get("/api/v1/audit-logs")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchView(z.array(auditLogViews.default));
    expect(response.body.meta).toMatchObject({ hasMore: false });
    expect(response.body.meta).toHaveProperty("nextCursor");
  });

  it("should mask the IP for a reader without :full and reveal it with :full", async () => {
    await seedAudit({ ip: "192.168.1.42" });

    const masked = await buildMaskedReader();
    const full = await buildFullReader();

    const maskedToken = await loginAs(masked.email, masked.password);
    const fullToken = await loginAs(full.email, full.password);

    const maskedRes = await request(app)
      .get("/api/v1/audit-logs")
      .set("Authorization", `Bearer ${maskedToken}`);
    const fullRes = await request(app)
      .get("/api/v1/audit-logs")
      .set("Authorization", `Bearer ${fullToken}`);

    expect(maskedRes.status).toBe(200);
    expect(fullRes.status).toBe(200);
    expect(maskedRes.body.data[0].ip).toBe("192.168.1.***");
    expect(fullRes.body.data[0].ip).toBe("192.168.1.42");
  });

  it("should filter by action, targetType and actorId", async () => {
    const actorId = crypto.randomUUID();
    await seedAudit({ action: "USER_BANNED", targetType: "User", actorId });
    await seedAudit({ action: "USER_DELETED", targetType: "User" });
    await seedAudit({ action: "USER_CREATED", targetType: "System" });

    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const byAction = await request(app)
      .get("/api/v1/audit-logs?action=USER_BANNED")
      .set("Authorization", `Bearer ${token}`);
    expect(byAction.body.data).toHaveLength(1);
    expect(byAction.body.data[0].action).toBe("USER_BANNED");

    const byTargetType = await request(app)
      .get("/api/v1/audit-logs?targetType=System")
      .set("Authorization", `Bearer ${token}`);
    expect(byTargetType.body.data).toHaveLength(1);
    expect(byTargetType.body.data[0].targetType).toBe("System");

    const byActor = await request(app)
      .get(`/api/v1/audit-logs?actorId=${actorId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(byActor.body.data).toHaveLength(1);
    expect(byActor.body.data[0].actorId).toBe(actorId);
  });

  it("should filter by a from/to time window", async () => {
    await seedAudit({ createdAt: new Date("2026-01-01T00:00:00.000Z") });
    await seedAudit({ createdAt: new Date("2026-06-01T00:00:00.000Z") });
    await seedAudit({ createdAt: new Date("2026-12-01T00:00:00.000Z") });

    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get(
        "/api/v1/audit-logs?from=2026-05-01T00:00:00.000Z&to=2026-07-01T00:00:00.000Z",
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("should page through with a cursor without skipping or repeating (shared timestamps)", async () => {
    const sharedTime = new Date("2026-07-30T12:00:00.000Z");
    for (let i = 0; i < 5; i++) {
      await seedAudit({ createdAt: sharedTime });
    }

    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;

    do {
      const url: string = cursor
        ? `/api/v1/audit-logs?limit=2&cursor=${encodeURIComponent(cursor)}`
        : "/api/v1/audit-logs?limit=2";
      const page = await request(app)
        .get(url)
        .set("Authorization", `Bearer ${token}`);

      expect(page.status).toBe(200);
      for (const row of page.body.data) seen.push(row.id);
      cursor = page.body.meta.nextCursor;
      guard++;
    } while (cursor && guard < 10);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5); // no repeats
  });

  it("should reject a corrupted cursor with 422", async () => {
    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get("/api/v1/audit-logs?cursor=not-a-real-cursor")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
  });

  it("should reject a limit above the maximum with 422", async () => {
    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const response = await request(app)
      .get("/api/v1/audit-logs?limit=101")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
  });

  it("should not expose write routes (append-only)", async () => {
    const reader = await buildFullReader();
    const token = await loginAs(reader.email, reader.password);

    const patch = await request(app)
      .patch("/api/v1/audit-logs")
      .set("Authorization", `Bearer ${token}`)
      .send({ any: "thing" });
    const del = await request(app)
      .delete("/api/v1/audit-logs/some-id")
      .set("Authorization", `Bearer ${token}`);

    expect(patch.status).toBe(404);
    expect(del.status).toBe(404);
  });
});
