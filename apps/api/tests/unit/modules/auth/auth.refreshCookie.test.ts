import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CookieAttributes,
  RefreshCookieResponse,
} from "@/modules/auth/auth.refreshCookie";

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
 *
 * O `satisfies` é o que impede o fake de envelhecer: se a interface que o
 * módulo pede a uma resposta mudar, este arquivo fica vermelho no typecheck.
 */
function makeRes() {
  const set: { name: string; value: string; options: CookieAttributes }[] = [];
  const cleared: { name: string; options: Pick<CookieAttributes, "path"> }[] =
    [];

  const res = {
    cookie(name: string, value: string, options: CookieAttributes) {
      set.push({ name, value, options });
    },
    clearCookie(name: string, options: Pick<CookieAttributes, "path">) {
      cleared.push({ name, options });
    },
  } satisfies RefreshCookieResponse;

  return { res, set, cleared };
}

beforeEach(() => {
  envMock.NODE_ENV = "test";
});

describe("setRefreshCookie", () => {
  it("emits the refresh token under the cookie name the API reads back", () => {
    const { res, set } = makeRes();

    setRefreshCookie(res, "the-refresh-token");

    expect(set).toHaveLength(1);
    expect(set[0]?.name).toBe(REFRESH_TOKEN_COOKIE_NAME);
    expect(set[0]?.value).toBe("the-refresh-token");
  });

  it("carries the whole security policy, not a subset", () => {
    const { res, set } = makeRes();

    setRefreshCookie(res, "the-refresh-token");

    // Igualdade estrita, não `toMatchObject`: um atributo a mais que ninguém
    // decidiu é tão divergência quanto um a menos.
    expect(set[0]?.options).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_TTL_MS,
    });
  });

  // O ambiente é mudado **depois** do import do módulo: estes casos só passam
  // porque a política é lida a cada chamada, e não congelada na carga.
  it.each([
    { nodeEnv: "development", secure: false },
    { nodeEnv: "test", secure: false },
    { nodeEnv: "production", secure: true },
  ] as const)(
    "sets secure=$secure in $nodeEnv, and never loosens httpOnly or sameSite",
    ({ nodeEnv, secure }) => {
      envMock.NODE_ENV = nodeEnv;
      const { res, set } = makeRes();

      setRefreshCookie(res, "the-refresh-token");

      expect(set[0]?.options.secure).toBe(secure);
      expect(set[0]?.options.httpOnly).toBe(true);
      expect(set[0]?.options.sameSite).toBe("lax");
    },
  );
});

describe("clearRefreshCookie", () => {
  it("clears the same name and the same path that were set", () => {
    const { res, set, cleared } = makeRes();

    setRefreshCookie(res, "the-refresh-token");
    clearRefreshCookie(res);

    // O navegador só apaga o cookie quando nome e path batem: se as duas
    // operações divergirem, o logout responde 204 e o cookie fica no jar.
    expect(cleared[0]?.name).toBe(set[0]?.name);
    expect(cleared[0]?.options.path).toBe(set[0]?.options.path);
  });

  it("sends the path and nothing else", () => {
    const { res, cleared } = makeRes();

    clearRefreshCookie(res);

    // Quem identifica o cookie a apagar é nome/domínio/path. Mandar o resto
    // mudaria os bytes do `Set-Cookie` do logout sem mudar nada no navegador.
    expect(cleared[0]?.options).toEqual({
      path: REFRESH_TOKEN_COOKIE_PATH,
    });
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
    { label: "an array", value: ["a", "b"] },
    { label: "an object (a `j:` prefixed value)", value: { nested: "a" } },
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
