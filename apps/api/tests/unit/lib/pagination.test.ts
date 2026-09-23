import { defineSortConfig } from "@pet-oasis/api-contracts/pagination";
import { describe, expect, it } from "vitest";
import type { AppError } from "@/errors";
import {
  buildCursorFilter,
  buildOffsetArgs,
  buildOrderBy,
  cursorEnvelope,
  decodeCursor,
  encodeCursor,
  listEnvelope,
  offsetEnvelope,
} from "@/lib/pagination";

// Os schemas de query (`offsetQuerySchema`, `cursorQuerySchema`,
// `buildOffsetQuerySchema`) são contrato e têm o próprio teste no pacote
// `@pet-oasis/api-contracts`; aqui fica o que traduz a query em banco.

describe("pagination", () => {
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

  // ── Ordenação configurável (Fase 9.2, só no offset) ──────────────────────
  describe("ordenação configurável", () => {
    // Recurso fictício: `createdAt` desce por natureza, `name` sobe (S2).
    const sortConfig = defineSortConfig({
      fields: { createdAt: "desc", name: "asc" },
      default: "createdAt",
    });

    describe("buildOrderBy", () => {
      it("should fall back to the resource default field and its natural order", () => {
        expect(buildOrderBy({}, sortConfig)).toEqual([
          { createdAt: "desc" },
          { id: "desc" },
        ]);
      });

      it("should use the natural order of the requested field (S2)", () => {
        expect(buildOrderBy({ sort: "name" }, sortConfig)).toEqual([
          { name: "asc" },
          { id: "asc" },
        ]);
        expect(buildOrderBy({ sort: "createdAt" }, sortConfig)).toEqual([
          { createdAt: "desc" },
          { id: "desc" },
        ]);
      });

      it("should let an explicit order win over the natural one", () => {
        expect(
          buildOrderBy({ sort: "name", order: "desc" }, sortConfig),
        ).toEqual([{ name: "desc" }, { id: "desc" }]);
        expect(
          buildOrderBy({ sort: "createdAt", order: "asc" }, sortConfig),
        ).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
      });

      it("should always append the id tiebreaker following the order (S4)", () => {
        for (const query of [
          {},
          { sort: "name" as const },
          { sort: "name" as const, order: "desc" as const },
          { sort: "createdAt" as const, order: "asc" as const },
        ]) {
          const orderBy = buildOrderBy(query, sortConfig);
          expect(orderBy).toHaveLength(2);
          const [primary, tiebreaker] = orderBy as [
            Record<string, string>,
            Record<string, string>,
          ];
          expect(Object.keys(tiebreaker)).toEqual(["id"]);
          expect(tiebreaker.id).toBe(Object.values(primary)[0]);
        }
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
