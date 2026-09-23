import type { CookieOptions } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock } = vi.hoisted(() => ({
  envMock: { NODE_ENV: "test" as "development" | "test" | "production" },
}));

vi.mock("@/config/env", () => ({ env: envMock }));

const {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} = await import("@/modules/auth/auth.constants");

const { clearRefreshCookie, readRefreshCookie, setRefreshCookie } =
  await import("@/modules/auth/auth.refreshCookie");

/**
 * A resposta falsa: guarda o que o jar receberia. É o seam que torna a política
 * do cookie — `httpOnly`, `sameSite`, `secure`, `path`, `maxAge` — alcançável
 * sem HTTP, e é o único jeito de `secure` em produção ter teste (a suíte de
 * integração roda em `NODE_ENV=test`, onde ele é falso por definição).
 */
function makeRes() {
  const set: { name: string; value: string; options: CookieOptions }[] = [];
  const cleared: { name: string; options: CookieOptions }[] = [];

  return {
    set,
    cleared,
    cookie(name: string, value: string, options: CookieOptions) {
      set.push({ name, value, options });
    },
    clearCookie(name: string, options: CookieOptions) {
      cleared.push({ name, options });
    },
  };
}

describe("setRefreshCookie", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
  });

  it("emits the refresh token under the cookie name the API reads back", () => {
    const res = makeRes();

    setRefreshCookie(res, "the-refresh-token");

    expect(res.set).toHaveLength(1);
    expect(res.set[0]?.name).toBe(REFRESH_TOKEN_COOKIE_NAME);
    expect(res.set[0]?.value).toBe("the-refresh-token");
  });

  it("carries the whole security policy, not a subset", () => {
    const res = makeRes();

    setRefreshCookie(res, "the-refresh-token");

    // Igualdade estrita, não `toMatchObject`: um atributo a mais que ninguém
    // decidiu é tão divergência quanto um a menos.
    expect(res.set[0]?.options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  });

  it.each([
    { nodeEnv: "development", secure: false },
    { nodeEnv: "test", secure: false },
    { nodeEnv: "production", secure: true },
  ] as const)(
    "sets secure=$secure in $nodeEnv, and never loosens httpOnly or sameSite",
    ({ nodeEnv, secure }) => {
      envMock.NODE_ENV = nodeEnv;
      const res = makeRes();

      setRefreshCookie(res, "the-refresh-token");

      expect(res.set[0]?.options.secure).toBe(secure);
      expect(res.set[0]?.options.httpOnly).toBe(true);
      expect(res.set[0]?.options.sameSite).toBe("lax");
    },
  );

  it("reads the environment at call time, not at import time", () => {
    envMock.NODE_ENV = "production";
    const res = makeRes();

    setRefreshCookie(res, "the-refresh-token");

    expect(res.set[0]?.options.secure).toBe(true);
  });
});

describe("clearRefreshCookie", () => {
  beforeEach(() => {
    envMock.NODE_ENV = "test";
  });

  it("clears the same name and the same path that were set", () => {
    const res = makeRes();

    setRefreshCookie(res, "the-refresh-token");
    clearRefreshCookie(res);

    // O navegador só apaga o cookie quando nome e path batem: se as duas
    // operações divergirem, o logout responde 204 e o cookie fica no jar.
    expect(res.cleared[0]?.name).toBe(res.set[0]?.name);
    expect(res.cleared[0]?.options.path).toBe(res.set[0]?.options.path);
  });

  it("carries the policy without a lifetime — a clear has no prazo", () => {
    const res = makeRes();

    clearRefreshCookie(res);

    expect(res.cleared[0]?.options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
  });

  it("clears with secure in production too", () => {
    envMock.NODE_ENV = "production";
    const res = makeRes();

    clearRefreshCookie(res);

    expect(res.cleared[0]?.options.secure).toBe(true);
  });
});

describe("readRefreshCookie", () => {
  it("returns the token when the jar carries it", () => {
    expect(
      readRefreshCookie({
        cookies: { [REFRESH_TOKEN_COOKIE_NAME]: "the-refresh-token" },
      }),
    ).toBe("the-refresh-token");
  });

  it("returns undefined when the cookie is absent", () => {
    expect(readRefreshCookie({ cookies: {} })).toBeUndefined();
  });

  it("returns undefined when there is no cookie jar at all", () => {
    expect(readRefreshCookie({})).toBeUndefined();
  });

  it.each([
    { label: "an array (repeated header)", value: ["a", "b"] },
    { label: "an object (dotted cookie name)", value: { nested: "a" } },
    { label: "a number", value: 42 },
  ])(
    "returns undefined when the jar holds $label instead of a string",
    ({ value }) => {
      // `req.cookies` é `any` no Express e o valor vem do cliente: o cast que
      // o controller fazia prometia `string | undefined` sem provar nada.
      expect(
        readRefreshCookie({ cookies: { [REFRESH_TOKEN_COOKIE_NAME]: value } }),
      ).toBeUndefined();
    },
  );
});
