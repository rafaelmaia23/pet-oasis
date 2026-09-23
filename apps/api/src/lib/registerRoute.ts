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
 * O status de sucesso desta entrada tem corpo? É a única coisa que o tipo do
 * handler precisa saber sobre a resposta.
 *
 * **O tipo do corpo não é derivado da view, de propósito.** A view é um parser
 * de whitelist, e é ela que estreita: `featureNameSchema` recebe o `string` que
 * veio do banco e devolve a união literal, `z.coerce.date()` recebe o que vier
 * e devolve `Date`. Exigir a entrada da view no retorno do handler obrigaria o
 * serviço a afirmar a união antes do parse — o `as` que
 * `apps/api/docs/adr/0095-fronteira-featurename-string.md` decidiu evitar. Quem
 * confere a forma da resposta é o `presentWith`, em runtime, como sempre foi
 * com os presenters (`present(data: unknown, …)`).
 */
type HasResponseBody<E extends RouteDefinition> =
  E["responses"][SuccessStatus<E>] extends {
    view: z.ZodType | readonly z.ZodType[];
  }
    ? true
    : false;

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
export type RouteHandler<E extends RouteDefinition> =
  HasResponseBody<E> extends true
    ? (context: RouteHandlerContext<E>) => Promise<unknown> | unknown
    : (context: RouteHandlerContext<E>) => Promise<void> | void;

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
function successOf(entry: RouteDefinition, where: string) {
  const statuses = Object.keys(entry.responses).map(Number);

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
  // O par método + path, montado uma vez: nomeia a rota tanto na recusa do
  // registro quanto no contexto do erro de apresentação.
  const where = `${entry.method} ${entry.path}`;
  const { status, view } = successOf(entry, where);

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

      res.status(status).json(presentWith(view, result, { route: where }));
    } catch (error) {
      next(error);
    }
  };

  router[METHODS[entry.method]](entry.path, ...before, dispatch);
}
