/**
 * O cookie de sessão da API: **emitir, ler e limpar**, e nada além disso.
 *
 * As propriedades de segurança do refresh token — `httpOnly`, `sameSite`,
 * `secure`, o `path` a que ele se restringe e o prazo que anuncia — são
 * decididas aqui, num lugar só. Antes viviam em quatro expressões do controller
 * (dois blocos de seis atributos idênticos, três leituras com cast e um
 * `clearCookie` repetindo o path à mão): `refresh` podia perder `httpOnly` ou
 * `sameSite` com a suíte verde, porque só o login afirmava os atributos.
 *
 * Por que cada atributo é o que é está em
 * `docs/adr/0055-design-session-access-jwt-15min-refresh-opaco-rotativo.md`; o
 * resumo é que o refresh é opaco, rotativo e nunca deve ser alcançável por
 * JavaScript nem viajar em requisição de terceiro site.
 *
 * **O BFF do web espelha esta política** (esforço `fase-12-web-auth-spine`,
 * `.scratch/fase-12-web-auth-spine/issues/04-session-module-and-auth-bff.md`):
 * o cookie de sessão do front é do domínio dele e carrega o refresh token, com
 * o mesmo prazo de 7 dias deslizantes. São dois cookies em dois domínios, não
 * um só — mas quem mexer aqui em `sameSite` ou no TTL precisa olhar lá, senão
 * as duas metades da mesma sessão passam a expirar em momentos diferentes.
 */
import { env } from "@/config/env";
import {
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
  REFRESH_TOKEN_TTL_MS,
} from "./auth.constants";

/**
 * O que o módulo precisa de uma resposta e de uma requisição — nada mais que o
 * jar. O `Response` e o `Request` do Express satisfazem os dois sem cast, e a
 * resposta falsa do teste unitário os satisfaz sem subir HTTP.
 */
export type CookieAttributes = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge?: number;
};

export type RefreshCookieResponse = {
  cookie(name: string, value: string, options: CookieAttributes): unknown;
  clearCookie(name: string, options: Pick<CookieAttributes, "path">): unknown;
};

export type RefreshCookieRequest = {
  cookies?: unknown;
};

/**
 * Os atributos que protegem e endereçam o cookie. O prazo fica fora: quem
 * emite tem prazo, quem limpa não.
 */
const refreshCookiePolicy = (): CookieAttributes => ({
  httpOnly: true,
  sameSite: "lax",
  // Ambiente é lido a cada chamada, não no import: o módulo não guarda cópia de
  // uma decisão que o processo já tomou em `env`, e o teste alcança produção.
  secure: env.NODE_ENV === "production",
  path: REFRESH_TOKEN_COOKIE_PATH,
});

/**
 * Emite o refresh token na resposta, com a política inteira mais o prazo. O
 * `maxAge` é o **mesmo** TTL com que o service grava `Session.expiresAt`: o
 * cookie não sobrevive à sessão que representa.
 */
export const setRefreshCookie = (
  res: RefreshCookieResponse,
  refreshToken: string,
): void => {
  res.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
    ...refreshCookiePolicy(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
};

/**
 * Limpa o cookie. Nome e `path` vêm da mesma origem que os do `set` — o
 * navegador só apaga quando os dois batem, e dois literais iguais mantidos à
 * mão são exatamente o que falha em silêncio (o logout responderia 204 com o
 * cookie ainda no jar).
 *
 * Só o `path` viaja, e não a política inteira: quem identifica o cookie a
 * apagar é a tripla nome/domínio/path, então `httpOnly`, `sameSite` e `secure`
 * não mudariam nada no navegador — mudariam só os bytes do `Set-Cookie` do
 * logout, e este esforço não altera comportamento externo.
 */
export const clearRefreshCookie = (res: RefreshCookieResponse): void => {
  res.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
    path: refreshCookiePolicy().path,
  });
};

/**
 * Lê o refresh token da requisição. `req.cookies` é `any` no Express e o valor
 * vem do cliente: o cast que o controller fazia prometia `string | undefined`
 * sem provar nada — o `cookie-parser` devolve objeto quando o valor chega com o
 * prefixo `j:`. Aqui o tipo é verificado, e o que não for texto é tratado como
 * ausência (401 ou 204, em vez de um objeto descendo até o hash do token).
 */
export const readRefreshCookie = (
  req: RefreshCookieRequest,
): string | undefined => {
  if (typeof req.cookies !== "object" || req.cookies === null) return undefined;

  const value = (req.cookies as Record<string, unknown>)[
    REFRESH_TOKEN_COOKIE_NAME
  ];

  return typeof value === "string" ? value : undefined;
};
