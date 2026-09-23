import type { RouteDefinition } from "@pet-oasis/api-contracts/routes";
import type { RequestHandler, Router } from "express";
import type { z } from "zod";
import type { AuthUser } from "@/lib/authorization";
import { getAuthUser } from "@/utils/getAuthUser";
import { presentWith } from "@/utils/presenter";

/**
 * O segundo adaptador da tabela de rotas — o primeiro é o `/openapi.json`
 * (`docs/adr/0003-route-table-is-contract-openapi-is-derived.md`, na raiz).
 * Registra a operação **a partir da entrada da tabela**: o método, o path, o
 * parse do envelope de request, o status de sucesso e a view saem todos de
 * lá, e não de uma segunda declaração no router e numa terceira no
 * controller.
 *
 * ```ts
 * registerRoute(router, routes.me.get, {
 *   before: [canAccess("read:user")],
 *   handler: async ({ actor }) => meService.getMe(actor),
 * });
 * ```
 *
 * O handler recebe o envelope **já validado** e devolve o dado que a view
 * descreve (ou nada, no 204). Ele não toca `res`: quem decide status e
 * serialização é a tabela.
 *
 * **O que é do servidor entra por `before`**, na ordem em que já roda hoje —
 * `authenticate`/`optionalAuthenticate`, `canAccess`, `rateLimitByIp`, upload
 * de imagem. A tabela não os conhece, e por isso continuam explícitos no
 * arquivo de rotas do módulo.
 */

/** O envelope `{ body?, params?, query? }` que o schema da entrada produz. */
type ParsedRequest<E> = E extends { request: infer R }
  ? R extends z.ZodType
    ? z.output<R>
    : unknown
  : unknown;

/** O único status de sucesso que a entrada declara. */
type SuccessStatus<E extends RouteDefinition> = keyof E["responses"];

/**
 * O corpo que o handler deve devolver: a entrada da view do status de sucesso.
 * É `never` quando o status não tem corpo (204) — e é esse `never` que o
 * `RouteHandler` abaixo lê para pedir um handler sem retorno. Uma entrada cuja
 * `view` é a escada de capability cai em `unknown`: o registrador a recusa no
 * registro até a escada ganhar dono (issue 17 do esforço).
 */
export type RouteSuccessBody<E extends RouteDefinition> =
  E["responses"][SuccessStatus<E>] extends {
    view: infer V;
  }
    ? V extends z.ZodType
      ? z.input<V>
      : unknown
    : never;

/**
 * O ator é obrigatório onde a tabela diz `auth: "bearer"` — não porque o
 * registrador autentique (quem faz isso é o `authenticate` em `before`), mas
 * porque ali ele já não pode faltar: chegar sem `req.user` numa rota bearer é
 * 401, e o handler não roda.
 */
type RouteActor<E extends RouteDefinition> = E["auth"] extends "bearer"
  ? AuthUser
  : AuthUser | undefined;

export type RouteHandlerContext<E extends RouteDefinition> =
  ParsedRequest<E> & {
    actor: RouteActor<E>;
  };

/**
 * O handler de uma rota: recebe o envelope já validado e devolve o que a view
 * descreve. Onde o status de sucesso não tem corpo, ele não devolve nada — daí
 * o ramo, que é o que faz `async () => {}` ser a forma certa de escrever o 204
 * e ser recusada em qualquer outra rota.
 */
export type RouteHandler<E extends RouteDefinition> = [
  RouteSuccessBody<E>,
] extends [never]
  ? (context: RouteHandlerContext<E>) => Promise<void> | void
  : (
      context: RouteHandlerContext<E>,
    ) => Promise<RouteSuccessBody<E>> | RouteSuccessBody<E>;

export type RouteRegistration<E extends RouteDefinition> = {
  /** Middleware de servidor, na ordem em que roda. */
  before?: RequestHandler[];
  handler: RouteHandler<E>;
};

const METHODS = {
  GET: "get",
  POST: "post",
  PUT: "put",
  PATCH: "patch",
  DELETE: "delete",
} as const satisfies Record<RouteDefinition["method"], keyof Router>;

/**
 * `Array.isArray` sozinho não estreita uma união com `readonly T[]` — o ramo
 * negativo continuaria carregando a escada. Este predicado é o que faz o
 * `else` do `successOf` ser de fato "uma view só".
 */
function isLadder(
  view: z.ZodType | readonly z.ZodType[] | undefined,
): view is readonly z.ZodType[] {
  return Array.isArray(view);
}

/**
 * O status de sucesso e a view, lidos da entrada. As duas formas que o
 * registrador ainda não sabe registrar falham **no registro** — na carga do
 * módulo, não no primeiro request —, com o par método + path na mensagem.
 */
function successOf(entry: RouteDefinition) {
  const statuses = Object.keys(entry.responses).map(Number);
  const where = `${entry.method} ${entry.path}`;

  const [status] = statuses;
  if (statuses.length !== 1 || status === undefined) {
    throw new Error(
      `${where}: o registrador deriva o status de sucesso da tabela e esta ` +
        `entrada declara ${statuses.length} (${statuses.join(", ")}). ` +
        `Quem escolhe entre eles é o handler, e isso ainda não tem forma.`,
    );
  }

  const view = entry.responses[status]?.view;
  if (isLadder(view)) {
    throw new Error(
      `${where}: a view desta entrada é a escada de capability, e escolher o ` +
        `degrau ainda não tem dono (issue 17 de .scratch/fase-12-module-depth/).`,
    );
  }

  return { status, view };
}

export function registerRoute<E extends RouteDefinition>(
  router: Router,
  entry: E,
  { before = [], handler }: RouteRegistration<E>,
): void {
  const { status, view } = successOf(entry);

  const dispatch: RequestHandler = async (req, res, next) => {
    try {
      // O envelope inteiro de uma vez: o que a entrada não declara é
      // derrubado aqui, e um `ZodError` daqui é o 422 que o error handler já
      // sabe formatar por campo.
      const parsed = entry.request
        ? entry.request.parse({
            body: req.body,
            params: req.params,
            query: req.query,
          })
        : {};

      const actor = entry.auth === "bearer" ? getAuthUser(req) : req.user;

      const result = await handler({
        ...parsed,
        actor,
      } as RouteHandlerContext<E>);

      if (!view) {
        res.status(status).send();
        return;
      }

      res
        .status(status)
        .json(
          presentWith(view, result, { route: `${entry.method} ${entry.path}` }),
        );
    } catch (error) {
      next(error);
    }
  };

  router[METHODS[entry.method]](entry.path, ...before, dispatch);
}
