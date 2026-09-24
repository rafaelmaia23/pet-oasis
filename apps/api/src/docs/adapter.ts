/// <reference types="zod-openapi" />

import type {
  RouteDefinition,
  RouteErrorResponse,
  RouteResponse,
} from "@pet-oasis/api-contracts/routes";
import { errorResponses, routes } from "@pet-oasis/api-contracts/routes";
import { z } from "zod";
import type {
  ZodObjectInput,
  ZodOpenApiOperationObject,
  ZodOpenApiParameters,
  ZodOpenApiPathsObject,
  ZodOpenApiResponseObject,
} from "zod-openapi";
import { env } from "@/config/env";
import { imageUploadBody } from "./components";

/**
 * O adaptador: traduz a tabela de rotas do contrato para o dialeto do
 * `zod-openapi`. **Nenhum path, schema ou prosa de rota nasce aqui** — tudo
 * vem de `@pet-oasis/api-contracts/routes`, e o que este arquivo faz é
 * converter as quatro diferenças de dialeto:
 *
 * - `:id` do Express → `{id}` do template OpenAPI;
 * - envelope `{ body, params, query }` → `requestBody` e `parameters`;
 * - escada de views → `anyOf`;
 * - `<domínio>.<operação>` da tabela → `operationId`;
 * - os dois erros que o próprio `registerRoute` garante (401 de toda rota
 *   `bearer`, 422 de toda rota com `request`) entram sozinhos — não são lidos
 *   de `route.errors`, são **derivados** (`derivedErrors` abaixo). A tabela
 *   listava os dois à mão em cada entrada, e a lista divergia da API real: a
 *   issue 16 de `.scratch/fase-12-module-depth/` achou catorze rotas com
 *   parâmetro que respondem 422 e não o declaravam. `route.errors` continua
 *   sendo onde cada rota lista o que só ela sabe (403/404/409/413/429/503) —
 *   o que o registrador não garante estruturalmente.
 *
 * A escada vira `anyOf`, e não `oneOf`, de propósito: os degraus se **contêm**
 * (quem vê custo vê também o que a view interna mostra), e `oneOf` exigiria que
 * o corpo casasse com exatamente um deles — um produto com custo casaria com
 * dois, e a spec passaria a acusar como inválido o que a API realmente devolve.
 *
 * A tabela não pode mais divergir do router: toda rota de domínio nasce do
 * `registerRoute`, que lê método e path direto da entrada (issue 15 de
 * `.scratch/fase-12-module-depth/`) — não sobra comparação a rodar. Quem prova
 * que o documento continua o mesmo é `tests/integration/v1/openapi.test.ts`,
 * e quem prova que ele não sub-declara é `tests/unit/docs/adapter.test.ts`.
 */

function toPathTemplate(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/**
 * Uma view vira o schema da resposta; a escada de capability vira a união dos
 * degraus, na ordem em que a tabela os declara.
 */
function toBodySchema(view: NonNullable<RouteResponse["view"]>): z.ZodType {
  if (!Array.isArray(view)) return view as z.ZodType;

  const ladder = view as readonly z.ZodType[];
  const [first, second, ...rest] = ladder;
  if (!first) throw new Error("escada de views vazia");
  if (!second) return first;

  return z.union([first, second, ...rest]);
}

function toResponse(response: RouteResponse): ZodOpenApiResponseObject {
  if (!response.view) return { description: response.description };

  return {
    description: response.description,
    content: { "application/json": { schema: toBodySchema(response.view) } },
  };
}

function toErrorResponse(error: RouteErrorResponse): ZodOpenApiResponseObject {
  const response: ZodOpenApiResponseObject = {
    description: error.description,
    content: { "application/json": { schema: error.schema } },
  };

  return error.headers ? { ...response, headers: error.headers } : response;
}

/**
 * Extrai as partes internas do envelope `z.object({ body?, params?, query? })`
 * usado pelos schemas de request: `params` → `path`, `query` → `query`, `body`
 * → requestBody JSON. Só emite o que existir.
 */
function fromEnvelope(
  schema: NonNullable<RouteDefinition["request"]>,
): Pick<ZodOpenApiOperationObject, "requestParams" | "requestBody"> {
  const shape = schema.shape as Record<string, unknown>;
  const parts: Pick<
    ZodOpenApiOperationObject,
    "requestParams" | "requestBody"
  > = {};

  const requestParams: ZodOpenApiParameters = {};
  if (shape.params) {
    requestParams.path = shape.params as ZodObjectInput;
  }
  if (shape.query) {
    requestParams.query = shape.query as ZodObjectInput;
  }
  if (Object.keys(requestParams).length > 0) {
    parts.requestParams = requestParams;
  }

  if (shape.body) {
    parts.requestBody = {
      content: { "application/json": { schema: shape.body as z.ZodType } },
    };
  }

  return parts;
}

/**
 * Os dois erros que `registerRoute` produz para **qualquer** entrada, sem
 * olhar para o service: toda rota `bearer` passa por `getAuthUser` (401 se o
 * ator faltar) e toda entrada com `request` passa pelo `.parse()` do envelope
 * (422 se o corpo não bater). Nenhum dos dois depende do que a rota faz — só
 * do que ela declara —, e é por isso que entram aqui e não em `route.errors`.
 */
function derivedErrors(
  route: RouteDefinition,
): Record<number, RouteErrorResponse> {
  return {
    ...(route.auth === "bearer" ? { 401: errorResponses[401] } : {}),
    ...(route.request ? { 422: errorResponses[422] } : {}),
  };
}

function toOperation(
  operationId: string,
  route: RouteDefinition,
): ZodOpenApiOperationObject {
  const responses: Record<string, ZodOpenApiResponseObject> = {};
  // `route.errors` vence em caso de conflito: uma rota que precise de prosa
  // própria num destes dois status (não existe hoje) ainda pode sobrescrever.
  const errors = { ...derivedErrors(route), ...route.errors };
  for (const [status, response] of Object.entries(route.responses)) {
    responses[status] = toResponse(response);
  }
  for (const [status, error] of Object.entries(errors)) {
    responses[status] = toErrorResponse(error);
  }

  return {
    tags: [route.tag],
    summary: route.summary,
    operationId,
    ...(route.description ? { description: route.description } : {}),
    // O documento exige `bearerAuth` por padrão; a rota pública o desliga.
    ...(route.auth === "public" ? { security: [] } : {}),
    ...(route.request ? fromEnvelope(route.request) : {}),
    ...(route.upload === "image"
      ? imageUploadBody(env.UPLOAD_MAX_FILE_SIZE_BYTES)
      : {}),
    responses,
  };
}

export function buildPathsFromRouteTable(): ZodOpenApiPathsObject {
  const paths: Record<string, Record<string, ZodOpenApiOperationObject>> = {};

  for (const [domain, group] of Object.entries(routes)) {
    for (const [operation, route] of Object.entries(group)) {
      const path = toPathTemplate(route.path);
      paths[path] ??= {};
      const item = paths[path];

      item[route.method.toLowerCase()] = toOperation(
        `${domain}.${operation}`,
        route,
      );
    }
  }

  return paths as ZodOpenApiPathsObject;
}
