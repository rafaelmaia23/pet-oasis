import { describe, expect, it } from "vitest";
import {
  invalidatableSessionsOfUserWhere,
  invalidatableSessionWhere,
  isInvalidatableSession,
  isLiveSession,
  liveSessionsOfUserWhere,
  liveSessionWhere,
} from "@/modules/auth/auth.liveSession.repository";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const LATER = new Date(NOW.getTime() + 1);
const EARLIER = new Date(NOW.getTime() - 1);

const session = (overrides: Partial<Parameters<typeof isLiveSession>[0]>) => ({
  usedAt: null,
  invalidatedAt: null,
  expiresAt: LATER,
  ...overrides,
});

describe("o filtro de sessão viva", () => {
  it("é exatamente as três cláusulas do glossário, e nenhuma a mais", () => {
    expect(liveSessionWhere(NOW)).toEqual({
      usedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: NOW },
    });
  });

  it("recorta por usuário sem afrouxar nenhuma das três", () => {
    expect(liveSessionsOfUserWhere("user-1", NOW)).toEqual({
      userId: "user-1",
      usedAt: null,
      invalidatedAt: null,
      expiresAt: { gt: NOW },
    });
  });

  it("lê o relógio quando ninguém passa o instante", () => {
    const before = Date.now();
    const where = liveSessionWhere();
    const after = Date.now();

    expect(where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.expiresAt.gt.getTime()).toBeLessThanOrEqual(after);
  });
});

describe("o filtro do que a invalidação alcança", () => {
  it("é duas cláusulas: ainda não foi morta e ainda não expirou", () => {
    expect(invalidatableSessionWhere(NOW)).toEqual({
      invalidatedAt: null,
      expiresAt: { gt: NOW },
    });
    expect(Object.keys(invalidatableSessionWhere(NOW))).not.toContain("usedAt");
  });

  it("recorta por usuário, e a viva é ele mais `usedAt` nulo — um é construído do outro", () => {
    const invalidatable = invalidatableSessionsOfUserWhere("user-1", NOW);

    expect(invalidatable).toEqual({
      userId: "user-1",
      invalidatedAt: null,
      expiresAt: { gt: NOW },
    });
    expect(liveSessionsOfUserWhere("user-1", NOW)).toEqual({
      ...invalidatable,
      usedAt: null,
    });
  });
});

describe("os predicados em memória", () => {
  it("aceitam a sessão não usada, não invalidada e com prazo no futuro", () => {
    expect(isLiveSession(session({}), NOW)).toBe(true);
    expect(isInvalidatableSession(session({}), NOW)).toBe(true);
  });

  it("separam a sessão rotacionada: não é viva, mas ainda é alcançável", () => {
    const rotated = session({ usedAt: EARLIER });

    expect(isLiveSession(rotated, NOW)).toBe(false);
    expect(isInvalidatableSession(rotated, NOW)).toBe(true);
  });

  it("recusam, os dois, a sessão já invalidada", () => {
    const killed = session({ invalidatedAt: EARLIER });

    expect(isLiveSession(killed, NOW)).toBe(false);
    expect(isInvalidatableSession(killed, NOW)).toBe(false);
  });

  it("recusam, os dois, a sessão expirada", () => {
    const expired = session({ expiresAt: EARLIER });

    expect(isLiveSession(expired, NOW)).toBe(false);
    expect(isInvalidatableSession(expired, NOW)).toBe(false);
  });

  it("recusam a sessão que expira exatamente agora — o corte é `gt`, não `gte`, como no banco", () => {
    const onTheDot = session({ expiresAt: NOW });

    expect(isLiveSession(onTheDot, NOW)).toBe(false);
    expect(isInvalidatableSession(onTheDot, NOW)).toBe(false);
  });

  it("concordam com o `where` que o banco recebe: as mesmas colunas, os mesmos nomes", () => {
    expect(Object.keys(liveSessionWhere(NOW)).sort()).toEqual([
      "expiresAt",
      "invalidatedAt",
      "usedAt",
    ]);
    expect(Object.keys(invalidatableSessionWhere(NOW)).sort()).toEqual([
      "expiresAt",
      "invalidatedAt",
    ]);
  });
});
