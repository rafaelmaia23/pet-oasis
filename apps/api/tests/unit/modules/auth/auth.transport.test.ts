import { describe, expect, it } from "vitest";
import { REFRESH_TOKEN_COOKIE_NAME } from "@/modules/auth/auth.constants";
import type { CookieAttributes } from "@/modules/auth/auth.refreshCookie";
import { authTransport } from "@/modules/auth/auth.transport";

/**
 * O transporte do módulo de auth pela **própria interface**: o que ele oferece
 * ao handler e a quem ele delega. Nada de HTTP e nada de banco — um `req` e um
 * `res` falsos bastam, porque é exatamente essa a fronteira que o transporte
 * existe para desenhar.
 *
 * O que se prova aqui é que o cookie de refresh continua sendo assunto do
 * módulo da issue 04 (`auth.refreshCookie.ts`): o transporte o chama, e é o
 * único ponto do caminho da rota que o alcança. O `registerRoute` não conhece
 * cookie nenhum.
 */

function fakeReq(overrides: Record<string, unknown> = {}) {
  return {
    cookies: {},
    headers: {},
    ip: "203.0.113.9",
    ...overrides,
    // biome-ignore lint/suspicious/noExplicitAny: o `Request` do Express é largo demais para um fake; o que o transporte lê está acima
  } as any;
}

function fakeRes() {
  const set: { name: string; value: string; options: CookieAttributes }[] = [];
  const cleared: { name: string; options: { path: string } }[] = [];

  const res = {
    cookie(name: string, value: string, options: CookieAttributes) {
      set.push({ name, value, options });
    },
    clearCookie(name: string, options: { path: string }) {
      cleared.push({ name, options });
    },
    // biome-ignore lint/suspicious/noExplicitAny: idem — o fake satisfaz o que `auth.refreshCookie` pede de uma resposta
  } as any;

  return { res, set, cleared };
}

describe("authTransport", () => {
  describe("o refresh token apresentado", () => {
    it("lê o cookie que o cliente mandou", () => {
      const transport = authTransport(
        fakeReq({ cookies: { [REFRESH_TOKEN_COOKIE_NAME]: "o-token" } }),
        fakeRes().res,
      );

      expect(transport.presentedRefreshToken).toBe("o-token");
    });

    it("sem cookie, não há token apresentado", () => {
      const transport = authTransport(fakeReq(), fakeRes().res);

      expect(transport.presentedRefreshToken).toBeUndefined();
    });

    it("valor não textual é ausência, como no módulo do cookie", () => {
      const transport = authTransport(
        fakeReq({ cookies: { [REFRESH_TOKEN_COOKIE_NAME]: { j: 1 } } }),
        fakeRes().res,
      );

      expect(transport.presentedRefreshToken).toBeUndefined();
    });
  });

  describe("emitir e limpar", () => {
    it("emite pelo módulo do cookie, com o nome e os atributos dele", () => {
      const { res, set } = fakeRes();

      authTransport(fakeReq(), res).issueRefreshToken("o-novo");

      expect(set).toHaveLength(1);
      expect(set[0]?.name).toBe(REFRESH_TOKEN_COOKIE_NAME);
      expect(set[0]?.value).toBe("o-novo");
      expect(set[0]?.options.httpOnly).toBe(true);
    });

    it("limpa pelo módulo do cookie, no mesmo path em que emitiu", () => {
      const { res, set, cleared } = fakeRes();
      const transport = authTransport(fakeReq(), res);

      transport.issueRefreshToken("o-novo");
      transport.clearRefreshToken();

      expect(cleared).toHaveLength(1);
      expect(cleared[0]?.name).toBe(REFRESH_TOKEN_COOKIE_NAME);
      expect(cleared[0]?.options.path).toBe(set[0]?.options.path);
    });

    it("nada é emitido enquanto o handler não pedir", () => {
      const { res, set, cleared } = fakeRes();

      authTransport(fakeReq(), res);

      expect(set).toHaveLength(0);
      expect(cleared).toHaveLength(0);
    });
  });

  describe("de onde a sessão está sendo aberta", () => {
    it("entrega o user agent e o IP que a sessão grava", () => {
      const transport = authTransport(
        fakeReq({ headers: { "user-agent": "Firefox/1" }, ip: "198.51.100.7" }),
        fakeRes().res,
      );

      expect(transport.client).toEqual({
        userAgent: "Firefox/1",
        ipAddress: "198.51.100.7",
      });
    });

    it("os dois podem faltar — a sessão nasce sem eles", () => {
      const transport = authTransport(
        fakeReq({ headers: {}, ip: undefined }),
        fakeRes().res,
      );

      expect(transport.client).toEqual({
        userAgent: undefined,
        ipAddress: undefined,
      });
    });
  });
});
