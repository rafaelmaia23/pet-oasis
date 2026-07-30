import { describe, expect, it } from "vitest";
import type { AppError } from "@/errors";
import {
  buildCursorFilter,
  buildOffsetArgs,
  cursorEnvelope,
  cursorQuerySchema,
  DEFAULT_LIMIT,
  decodeCursor,
  encodeCursor,
  listEnvelope,
  MAX_LIMIT,
  offsetEnvelope,
  offsetQuerySchema,
} from "@/lib/pagination";

describe("pagination", () => {
  describe("offsetQuerySchema", () => {
    it("should default page to 1 and limit to DEFAULT_LIMIT", () => {
      const parsed = offsetQuerySchema.parse({});
      expect(parsed).toEqual({ page: 1, limit: DEFAULT_LIMIT });
    });

    it("should coerce string query params to numbers", () => {
      const parsed = offsetQuerySchema.parse({ page: "3", limit: "50" });
      expect(parsed).toEqual({ page: 3, limit: 50 });
    });

    it("should reject a limit above MAX_LIMIT", () => {
      const result = offsetQuerySchema.safeParse({
        limit: String(MAX_LIMIT + 1),
      });
      expect(result.success).toBe(false);
    });

    it("should reject page below 1", () => {
      expect(offsetQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    });
  });

  describe("cursorQuerySchema", () => {
    it("should default limit and leave cursor optional", () => {
      const parsed = cursorQuerySchema.parse({});
      expect(parsed.limit).toBe(DEFAULT_LIMIT);
      expect(parsed.cursor).toBeUndefined();
    });

    it("should reject a limit above MAX_LIMIT", () => {
      expect(
        cursorQuerySchema.safeParse({ limit: String(MAX_LIMIT + 1) }).success,
      ).toBe(false);
    });
  });

  describe("buildOffsetArgs", () => {
    it("should translate page/limit into skip/take", () => {
      expect(buildOffsetArgs({ page: 1, limit: 20 })).toEqual({
        skip: 0,
        take: 20,
      });
      expect(buildOffsetArgs({ page: 3, limit: 20 })).toEqual({
        skip: 40,
        take: 20,
      });
    });
  });

  describe("offsetEnvelope", () => {
    it("should wrap data with page/limit/total meta", () => {
      const env = offsetEnvelope(["a", "b"], { page: 2, limit: 20 }, 42);
      expect(env).toEqual({
        data: ["a", "b"],
        meta: { page: 2, limit: 20, total: 42 },
      });
    });
  });

  describe("listEnvelope", () => {
    it("should wrap data with an empty meta", () => {
      expect(listEnvelope([1, 2, 3])).toEqual({ data: [1, 2, 3], meta: {} });
    });
  });

  describe("encodeCursor / decodeCursor", () => {
    it("should round-trip a (createdAt, id) pair", () => {
      const cursor = {
        createdAt: new Date("2026-07-30T12:00:00.000Z"),
        id: "abc-123",
      };
      const decoded = decodeCursor(encodeCursor(cursor));
      expect(decoded.id).toBe(cursor.id);
      expect(decoded.createdAt.toISOString()).toBe(
        cursor.createdAt.toISOString(),
      );
    });

    it("should produce an opaque (non human-readable) token", () => {
      const encoded = encodeCursor({
        createdAt: new Date("2026-07-30T12:00:00.000Z"),
        id: "abc-123",
      });
      expect(encoded).not.toContain("abc-123");
      expect(encoded).not.toContain("2026");
    });

    it("should throw a 422 validation error on a corrupted cursor", () => {
      try {
        decodeCursor("not-a-valid-cursor!!!");
        expect.unreachable("decodeCursor should have thrown");
      } catch (error) {
        const appError = error as AppError;
        expect(appError.statusCode).toBe(422);
        expect(appError.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should throw when the decoded payload is missing fields", () => {
      const bogus = Buffer.from(
        JSON.stringify({ foo: "bar" }),
        "utf8",
      ).toString("base64url");
      expect(() => decodeCursor(bogus)).toThrow();
    });
  });

  describe("buildCursorFilter", () => {
    it("should return undefined when no cursor is given", () => {
      expect(buildCursorFilter(undefined)).toBeUndefined();
    });

    it("should build an OR clause with the id tiebreaker", () => {
      const createdAt = new Date("2026-07-30T12:00:00.000Z");
      const cursor = encodeCursor({ createdAt, id: "row-2" });
      const filter = buildCursorFilter(cursor);
      expect(filter).toEqual({
        OR: [
          { createdAt: { lt: createdAt } },
          { createdAt, id: { lt: "row-2" } },
        ],
      });
    });
  });

  describe("cursorEnvelope", () => {
    const row = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

    it("should report hasMore=false and null cursor when rows fit the page", () => {
      const rows = [
        row("a", "2026-07-30T12:00:02.000Z"),
        row("b", "2026-07-30T12:00:01.000Z"),
      ];
      const env = cursorEnvelope(rows, 20);
      expect(env.data).toHaveLength(2);
      expect(env.meta).toEqual({ nextCursor: null, hasMore: false });
    });

    it("should slice to the limit and emit a nextCursor when there is an extra row", () => {
      const rows = [
        row("a", "2026-07-30T12:00:03.000Z"),
        row("b", "2026-07-30T12:00:02.000Z"),
        row("c", "2026-07-30T12:00:01.000Z"),
      ];
      const env = cursorEnvelope(rows, 2);
      expect(env.data.map((r) => r.id)).toEqual(["a", "b"]);
      expect(env.meta.hasMore).toBe(true);
      expect(env.meta.nextCursor).not.toBeNull();
      // the next cursor points at the last item of THIS page (b), not the extra one
      const decoded = decodeCursor(env.meta.nextCursor as string);
      expect(decoded.id).toBe("b");
    });

    it("should not skip nor repeat rows that share a timestamp (tiebreaker)", () => {
      const sameTime = "2026-07-30T12:00:00.000Z";
      // three rows, identical createdAt, ordered by id desc as the query would return them
      const rows = [
        row("id-3", sameTime),
        row("id-2", sameTime),
        row("id-1", sameTime),
      ];

      // page 1: limit 2 -> take 3, slice to 2
      const page1 = cursorEnvelope(rows, 2);
      expect(page1.data.map((r) => r.id)).toEqual(["id-3", "id-2"]);
      expect(page1.meta.hasMore).toBe(true);

      // the cursor from page 1 must exclude id-3 and id-2 but keep id-1
      const cursor = decodeCursor(page1.meta.nextCursor as string);
      const filter = buildCursorFilter(page1.meta.nextCursor as string) as {
        OR: Array<Record<string, unknown>>;
      };
      // second branch is the tiebreaker: same timestamp, id strictly less than the cursor id
      expect(cursor.id).toBe("id-2");
      expect(filter.OR[1]).toEqual({
        createdAt: new Date(sameTime),
        id: { lt: "id-2" },
      });
    });
  });
});
