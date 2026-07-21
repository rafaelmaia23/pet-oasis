import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { apiReference } from "@scalar/express-api-reference";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import helmet from "helmet";

/** Rota que serve o bundle do Scalar a partir da própria origem. */
export const SCALAR_BUNDLE_PATH = "/scalar/standalone.js";

/**
 * Caminho do bundle standalone dentro do pacote `@scalar/api-reference`.
 *
 * O subpath `dist/browser/standalone.js` não está no mapa de `exports`, então
 * resolve-se a raiz do pacote e monta-se o caminho a partir dela. Resolver em
 * runtime (em vez de embutir no build) faz dev (tsx) e produção (bundle do
 * tsup) usarem o mesmo código: o pacote é dep de produção e está no
 * `node_modules` da imagem.
 */
export const scalarBundleFile = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@scalar/api-reference")),
  "browser",
  "standalone.js",
);

const NONCE_BYTES = 16;

/**
 * Gera um nonce novo por request para o `<script>` **inline** que inicia a UI
 * (`Scalar.createApiReference(...)`). O bundle é auto-hospedado, mas essa
 * chamada de init continua sendo código inline — sob `script-src 'self'` ela
 * seria bloqueada e a página viria 200 com a UI em branco. O nonce autoriza
 * exatamente esse bloco, sem abrir `'unsafe-inline'` para script nenhum.
 */
export function docsCspNonce(_req: Request, res: Response, next: NextFunction) {
  // base64url: nonce opaco sem `+`/`/`/`=`, que exigiriam escape no atributo
  // HTML e na diretiva da CSP.
  res.locals.cspNonce = randomBytes(NONCE_BYTES).toString("base64url");
  next();
}

/**
 * CSP escopada na doc. A CSP global segue estrita; aqui só se afrouxa o mínimo
 * que a UI do Scalar exige de fato:
 *
 * - `script-src 'nonce-…'`: autoriza o init inline (ver `docsCspNonce`).
 * - `style-src 'unsafe-inline'`: o bundle injeta o CSS em runtime, via tag
 *   `<style>` — não há como servir esse CSS de um arquivo.
 * - `img-src data:`: o favicon é um data-URI (o projeto não serve estáticos).
 * - `font-src data:`: as fontes do tema vêm embutidas no bundle.
 *
 * `script-src` continua sem `'unsafe-inline'` e sem CDN — é justamente por isso
 * que o bundle passou a ser auto-hospedado (D3).
 *
 * **Violações esperadas no console de `/reference`** (verificado no navegador;
 * a UI renderiza e o "try it" funciona apesar delas — são a CSP fazendo o
 * trabalho dela, não regressão):
 *
 * 1. `eval` bloqueado — o bundle roda `try { Function("") } catch {}` como
 *    *feature detection*; o erro é capturado e há fallback. Destravar exigiria
 *    `'unsafe-eval'`, que não entra.
 * 2. inline script bloqueado (`script-src-elem`) — o bundle injeta um `<script>`
 *    em runtime e o build standalone não repassa o nonce a ele. Nada visível
 *    deixa de funcionar.
 * 3. duas chamadas a `api.scalar.com/vector/registry/*` — o Scalar buscando o
 *    diretório público de APIs dele, sem relação com esta spec. `hideSearch` e
 *    `telemetry: false` foram testados e **não** as evitam; liberá-las no
 *    `connect-src` significaria autorizar um terceiro e perder o offline.
 */
export const docsCsp = helmet.contentSecurityPolicy({
  directives: {
    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
    "script-src": [
      "'self'",
      (_req, res) => `'nonce-${(res as Response).locals.cspNonce}'`,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'", "data:"],
  },
});

/**
 * UI interativa da API (Scalar), servida em `GET /reference`. Consome o
 * documento público `/openapi.json` (gerado em `openapi.ts`) e carrega o
 * bundle do Scalar **da própria origem** (D3) — o que permite manter a CSP do
 * helmet com `script-src 'self'` e faz a UI funcionar sem internet.
 *
 * O "try it" usa o securityScheme bearer do spec (`bearerAuth`): o visitante
 * loga pelo `POST /auth/login` com o usuário demo (credenciais na introdução
 * do spec), copia o `accessToken` e cola no campo Bearer.
 *
 * O favicon é um data-URI porque o projeto não serve arquivos estáticos —
 * apontar para `/favicon.ico` exigiria montar `express.static` só para isso.
 */
const referenceConfiguration: Parameters<typeof apiReference>[0] = {
  url: "/openapi.json",
  cdn: SCALAR_BUNDLE_PATH,
  pageTitle: "Pet Oasis API — Referência",
  theme: "deepSpace",
  // As fontes padrão do tema vêm de fonts.scalar.com — um terceiro, que a CSP
  // (`font-src 'self' data:`) bloquearia. Desligadas: a UI usa as fontes do
  // sistema, e a página deixa de depender de rede externa (mesmo motivo de
  // auto-hospedar o bundle, D3).
  withDefaultFonts: false,
  telemetry: false,
  authentication: { preferredSecurityScheme: "bearerAuth" },
  favicon:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐾</text></svg>",
  metaData: {
    title: "Pet Oasis API — Referência",
    description:
      "API REST de pet shop com autenticação JWT + refresh rotativo, RBAC " +
      "com overrides e 330+ testes. Documentação interativa com usuário " +
      "demo — teste sem instalar nada.",
    ogTitle: "Pet Oasis API — Referência interativa",
    ogDescription:
      "Logue com o usuário demo e veja o RBAC decidindo ao vivo: 200 na " +
      "leitura, 403 na escrita.",
  },
};

/**
 * O handler é montado por request porque o nonce muda a cada uma.
 *
 * O cast existe porque o `apiReference` declara `Request<never, string>` (ele
 * ignora params/body), o que não é atribuível ao `RequestHandler` genérico do
 * Express sob `exactOptionalPropertyTypes`.
 */
export const referenceHandler: RequestHandler = (req, res, next) => {
  const handler = apiReference({
    ...referenceConfiguration,
    nonce: res.locals.cspNonce as string,
  }) as RequestHandler;

  return handler(req, res, next);
};
