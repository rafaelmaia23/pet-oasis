import type { RouteDefinition } from "@pet-oasis/api-contracts/routes";
import type { Request, RequestHandler, Response, Router } from "express";
import type { z } from "zod";
import { createPresentationError } from "@/errors/errorFactory";
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
 *
 * **O que o transporte sabe e a tabela não descreve entra por `context`** — o
 * jar de cookies, o user agent, o IP de quem chamou. O registrador não conhece
 * nenhum deles: ele chama a função do módulo e espalha o resultado no contexto
 * do handler (ver `RouteRegistration.context`).
 */

/** O envelope `{ body?, params?, query? }` que o schema da entrada produz. */
type ParsedRequest<E> = E extends { request: infer R }
  ? R extends z.ZodType
    ? z.output<R>
    : unknown
  : unknown;

/** Os status de sucesso que a entrada declara — um, ou a união deles. */
type SuccessStatus<E extends RouteDefinition> = keyof E["responses"];

/**
 * `T` é uma união de mais de um membro? É o que distingue a entrada de status
 * único (a esmagadora maioria) daquela em que o desfecho escolhe o status.
 */
type IsUnion<T, U = T> = T extends unknown
  ? [U] extends [T]
    ? false
    : true
  : never;

type HasSingleStatus<E extends RouteDefinition> =
  IsUnion<SuccessStatus<E>> extends true ? false : true;

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
 * O desfecho de uma rota com **mais de um status de sucesso**: o handler diz
 * qual dos declarados aconteceu, e o corpo é exigido exatamente onde aquele
 * status tem view. É `POST /auth/signup` (201 criado · 202 email de reativação
 * enviado) — a única rota em que a tabela sozinha não determina o status,
 * porque quem sabe o que aconteceu é o caso de uso.
 */
export type RouteOutcome<E extends RouteDefinition> = {
  [S in keyof E["responses"]]: E["responses"][S] extends {
    view: z.ZodType | readonly z.ZodType[];
  }
    ? { status: S; body: unknown }
    : { status: S; body?: undefined };
}[keyof E["responses"]];

/**
 * O ator é obrigatório onde a tabela diz `auth: "bearer"` — não porque o
 * registrador autentique (quem faz isso é o `authenticate` em `before`), mas
 * porque ali ele já não pode faltar: chegar sem `req.user` numa rota bearer é
 * 401, e o handler não roda.
 */
type RouteActor<E extends RouteDefinition> = E["auth"] extends "bearer"
  ? AuthUser
  : AuthUser | undefined;

/** Nenhum contexto de módulo: o handler vê só o envelope e o ator. */
type NoModuleContext = Record<never, never>;

export type RouteHandlerContext<
  E extends RouteDefinition,
  C = NoModuleContext,
> = C & ParsedRequest<E> & { actor: RouteActor<E> };

/**
 * O handler de uma rota: recebe o envelope já validado e devolve o que a view
 * descreve. Onde o status de sucesso não tem corpo, ele não devolve nada — daí
 * o ramo, que é o que faz `async () => {}` ser a forma certa de escrever o 204
 * e ser recusada em qualquer outra rota. Onde a entrada declara mais de um
 * status, o retorno é o desfecho etiquetado.
 */
export type RouteHandler<E extends RouteDefinition, C = NoModuleContext> =
  HasSingleStatus<E> extends true
    ? HasResponseBody<E> extends true
      ? (context: RouteHandlerContext<E, C>) => Promise<unknown> | unknown
      : (context: RouteHandlerContext<E, C>) => Promise<void> | void
    : (
        context: RouteHandlerContext<E, C>,
      ) => Promise<RouteOutcome<E>> | RouteOutcome<E>;

export type RouteRegistration<E extends RouteDefinition, C> = {
  /** Middleware de servidor, na ordem em que roda. */
  before?: RequestHandler[];
  /**
   * O que este módulo precisa do transporte e a tabela não descreve: o cookie
   * de sessão, o user agent, o IP. O registrador não sabe o que nenhum deles é
   * — ele chama isto **depois** do `before` e do parse do envelope, e espalha o
   * retorno no contexto do handler. Quem recebe `req`/`res` é o módulo, que os
   * embrulha na interface que quiser; o handler continua sem tocar `res`.
   *
   * É uma **função nomeada do módulo** (`auth.transport.ts` é a primeira), e
   * não um arrow inline: um arrow cujos parâmetros o registrador teria de
   * tipar é *context-sensitive*, e o TypeScript só o resolve depois de já ter
   * fixado o contexto do handler — o handler receberia o contexto vazio.
   */
  context?: (req: Request, res: Response) => C;
  handler: RouteHandler<E, C>;
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
 * `else` do `viewsOf` ser de fato "uma view só".
 */
function isLadder(
  view: z.ZodType | readonly z.ZodType[] | undefined,
): view is readonly z.ZodType[] {
  return Array.isArray(view);
}

/**
 * As views de sucesso, por status, lidas da entrada. A forma que o registrador
 * ainda não sabe registrar — a view em escada — falha **no registro**, na carga
 * do módulo e não no primeiro request, com o par método + path na mensagem.
 */
function viewsOf(entry: RouteDefinition, where: string) {
  const views = new Map<number, z.ZodType | undefined>();

  for (const key of Object.keys(entry.responses)) {
    const status = Number(key);
    const view = entry.responses[status]?.view;

    if (isLadder(view)) {
      throw new Error(
        `${where}: a view desta entrada é a escada de capability, e escolher o ` +
          `degrau ainda não tem dono (issue 17 de .scratch/fase-12-module-depth/).`,
      );
    }

    views.set(status, view);
  }

  return views;
}

/**
 * O desfecho etiquetado que o handler devolveu, conferido contra os status que
 * a entrada declara. Um status que a tabela não promete é a mesma quebra que
 * uma resposta que a view desmente — 500 de apresentação, nunca 422: o request
 * estava certo.
 */
function outcomeOf(
  result: unknown,
  views: Map<number, z.ZodType | undefined>,
  where: string,
): { status: number; body: unknown } {
  const outcome = result as { status?: unknown; body?: unknown } | null;
  const status = typeof outcome?.status === "number" ? outcome.status : NaN;

  if (!views.has(status)) {
    throw createPresentationError({
      context: {
        route: where,
        reason:
          "O handler escolheu um status que a entrada da tabela não declara",
        status: outcome?.status,
        declared: [...views.keys()],
      },
    });
  }

  return { status, body: outcome?.body };
}

export function registerRoute<E extends RouteDefinition, C = NoModuleContext>(
  router: Router,
  entry: E,
  { before = [], context, handler }: RouteRegistration<E, C>,
): void {
  // O par método + path, montado uma vez: nomeia a rota tanto na recusa do
  // registro quanto no contexto do erro de apresentação.
  const where = `${entry.method} ${entry.path}`;
  const views = viewsOf(entry, where);
  const [onlyStatus] = views.keys();
  const single = views.size === 1 && onlyStatus !== undefined;

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
        // O contexto do módulo vem primeiro: o que a tabela declara vence uma
        // chave de mesmo nome, porque a entrada é a fonte.
        ...context?.(req, res),
        ...parsed,
        actor,
      } as RouteHandlerContext<E, C>);

      const { status, body } = single
        ? { status: onlyStatus, body: result }
        : outcomeOf(result, views, where);

      const view = views.get(status);

      if (!view) {
        res.status(status).send();
        return;
      }

      res.status(status).json(presentWith(view, body, { route: where }));
    } catch (error) {
      next(error);
    }
  };

  router[METHODS[entry.method]](entry.path, ...before, dispatch);
}
