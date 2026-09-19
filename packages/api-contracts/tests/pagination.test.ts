import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildOffsetQuerySchema,
  cursorQuerySchema,
  DEFAULT_LIMIT,
  defineSortConfig,
  MAX_LIMIT,
  offsetQuerySchema,
} from "../src/pagination";

// A parte da paginação que é contrato: o que o cliente manda. O que traduz
// isso em query do banco (skip/take, orderBy, cursor) é helper da API e tem o
// próprio teste lá.
describe("pagination — schemas de query", () => {
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

  // ── Ordenação configurável (só no offset) ─────────────────────────────────
  describe("buildOffsetQuerySchema", () => {
    // Recurso fictício: `createdAt` desce por natureza, `name` sobe.
    const sortConfig = defineSortConfig({
      fields: { createdAt: "desc", name: "asc" },
      default: "createdAt",
    });

    const schema = buildOffsetQuerySchema(sortConfig, {
      status: z.enum(["ACTIVE", "PENDING"]).optional(),
    });

    it("should keep page/limit defaults and leave sort/order optional", () => {
      const parsed = schema.parse({});
      expect(parsed).toEqual({ page: 1, limit: DEFAULT_LIMIT });
    });

    it("should keep the resource filters alongside sort/order", () => {
      const parsed = schema.parse({ status: "ACTIVE", sort: "name" });
      expect(parsed.status).toBe("ACTIVE");
      expect(parsed.sort).toBe("name");
    });

    it("should reject a sort field outside the allowlist", () => {
      const result = schema.safeParse({ sort: "passwordHash" });
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes("sort"))).toBe(
        true,
      );
    });

    it("should reject an order value other than asc/desc", () => {
      const result = schema.safeParse({ sort: "name", order: "sideways" });
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes("order"))).toBe(
        true,
      );
    });

    it("should reject order without sort, naming the order field", () => {
      const result = schema.safeParse({ order: "asc" });
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((i) => i.path.includes("order"))).toBe(
        true,
      );
    });

    it("should still expose .shape (the OpenAPI generator depends on it)", () => {
      expect(Object.keys(schema.shape).sort()).toEqual([
        "limit",
        "order",
        "page",
        "sort",
        "status",
      ]);
    });
  });
});
