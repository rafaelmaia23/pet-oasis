import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { record, writeAudited } from "@/lib/auditLog";
import { logBuffer } from "@/lib/logBuffer";
import { prisma } from "@/lib/prisma";
import { runWithRequestContext } from "@/lib/requestContext";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("auditLog.record", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    logBuffer.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should write a row from the descriptor", async () => {
    await record({
      action: "USER_BANNED",
      targetType: "User",
      targetId: "target-123",
      metadata: { reasonProvided: true },
    });

    const rows = await prisma.auditLog.findMany();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "USER_BANNED",
      targetType: "User",
      targetId: "target-123",
      metadata: { reasonProvided: true },
    });
  });

  it("should take actorId, ip and userAgent from the request context", async () => {
    await runWithRequestContext(
      {
        requestId: "req-1",
        actorId: "actor-99",
        ip: "203.0.113.5",
        userAgent: "curl/8",
      },
      () => record({ action: "USER_DELETED", targetType: "User" }),
    );

    const [row] = await prisma.auditLog.findMany();

    expect(row).toMatchObject({
      actorId: "actor-99",
      ip: "203.0.113.5",
      userAgent: "curl/8",
    });
  });

  it("should let an explicit actorId override the store", async () => {
    await runWithRequestContext(
      { requestId: "req-2", actorId: "from-store" },
      () =>
        record({
          action: "USER_CREATED",
          targetType: "User",
          actorId: "explicit",
        }),
    );

    const [row] = await prisma.auditLog.findMany();

    expect(row?.actorId).toBe("explicit");
  });

  // §4.6 — evento direto: a falha não derruba o request, só emite error.
  it("should swallow a write failure and log it as error when there is no tx", async () => {
    vi.spyOn(prisma.auditLog, "create").mockRejectedValueOnce(
      new Error("db down"),
    );

    await expect(
      record({ action: "AUTH_LOGIN_FAILED", targetType: "User" }),
    ).resolves.toBeUndefined();
    await flush();

    const errorLine = logBuffer
      .list()
      .find((entry) => entry.module === "audit" && entry.level === 50);

    expect(errorLine).toBeDefined();
  });

  // §4.5 — dentro de uma tx: a falha propaga, para a $transaction inteira reverter.
  it("should propagate a write failure when a tx is provided", async () => {
    const tx = {
      auditLog: { create: vi.fn().mockRejectedValue(new Error("tx boom")) },
    } as unknown as Parameters<typeof record>[1];

    await expect(
      record({ action: "USER_BANNED", targetType: "User" }, tx),
    ).rejects.toThrow("tx boom");
  });
});

describe("auditLog.writeAudited", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.tag.deleteMany();
  });

  it("should run the work inside a transaction, write the audit row and return the work's result", async () => {
    const result = await writeAudited(
      { action: "TAG_CREATED", targetType: "Tag" },
      (tx) => tx.tag.create({ data: { name: "collar", slug: "collar" } }),
    );

    expect(result.name).toBe("collar");

    const rows = await prisma.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "TAG_CREATED", targetType: "Tag" });
  });

  it("should build the descriptor from the work's result when a builder is passed", async () => {
    const tag = await writeAudited(
      (created: { id: string }) => ({
        action: "TAG_CREATED",
        targetType: "Tag",
        targetId: created.id,
      }),
      (tx) => tx.tag.create({ data: { name: "leash", slug: "leash" } }),
    );

    const [row] = await prisma.auditLog.findMany();
    expect(row?.targetId).toBe(tag.id);
  });

  // §4.5 — mutação e audit vivem na mesma `$transaction`: qualquer falha depois
  // da mutação (a gravação do audit incluída) desfaz o que já rodou.
  it("should undo the mutation when the transaction fails after it", async () => {
    await expect(
      writeAudited({ action: "TAG_CREATED", targetType: "Tag" }, async (tx) => {
        await tx.tag.create({ data: { name: "bowl", slug: "bowl" } });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const tags = await prisma.tag.findMany();
    expect(tags).toHaveLength(0);
  });
});
