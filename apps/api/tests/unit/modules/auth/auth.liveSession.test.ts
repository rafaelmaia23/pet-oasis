import { describe, expect, it } from "vitest";
import {
  isLiveSession,
  liveSessionsOfUserWhere,
  liveSessionWhere,
  reachableSessionsOfUserWhere,
} from "@/modules/auth/auth.liveSession";

const NOW = new Date("2026-09-23T12:00:00.000Z");
const LATER = new Date(NOW.getTime() + 1);
const EARLIER = new Date(NOW.getTime() - 1);

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

describe("o predicado de sessão viva", () => {
  const session = (
    overrides: Partial<Parameters<typeof isLiveSession>[0]>,
  ) => ({
    usedAt: null,
    invalidatedAt: null,
    expiresAt: LATER,
    ...overrides,
  });

  it("aceita a sessão não usada, não invalidada e com prazo no futuro", () => {
    expect(isLiveSession(session({}), NOW)).toBe(true);
  });

  it("recusa a sessão já rotacionada", () => {
    expect(isLiveSession(session({ usedAt: EARLIER }), NOW)).toBe(false);
  });

  it("recusa a sessão invalidada", () => {
    expect(isLiveSession(session({ invalidatedAt: EARLIER }), NOW)).toBe(false);
  });

  it("recusa a sessão expirada", () => {
    expect(isLiveSession(session({ expiresAt: EARLIER }), NOW)).toBe(false);
  });

  it("recusa a sessão que expira exatamente agora — o filtro é `gt`, não `gte`", () => {
    expect(isLiveSession(session({ expiresAt: NOW }), NOW)).toBe(false);
  });

  it("concorda com o `where` que o banco recebe: as mesmas três colunas, os mesmos nomes", () => {
    expect(Object.keys(liveSessionWhere(NOW)).sort()).toEqual(
      ["expiresAt", "invalidatedAt", "usedAt"].sort(),
    );
  });
});

describe("o filtro do que a invalidação alcança", () => {
  it("é o de sessão viva sem `usedAt` — o elo rotacionado também precisa ser morto", () => {
    const live = liveSessionsOfUserWhere("user-1", NOW);
    const reachable = reachableSessionsOfUserWhere("user-1", NOW);

    expect(reachable).toEqual({
      userId: "user-1",
      invalidatedAt: null,
      expiresAt: { gt: NOW },
    });
    expect(Object.keys(reachable)).not.toContain("usedAt");
    // Superconjunto por construção: tudo o que sobra depois de tirar uma
    // cláusula continua valendo para quem passava nas três.
    for (const [key, value] of Object.entries(reachable)) {
      expect(live[key as keyof typeof live]).toEqual(value);
    }
  });
});
