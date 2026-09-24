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

/**
 * Os degraus que **esta entrada** declara. A tabela é escrita com `as const`,
 * então a tupla sobrevive ao typecheck e o degrau devolvido pode ser conferido
 * em compilação em vez de só em runtime. Numa entrada que declara uma view só,
 * isto é `never` — e é o que faz `chooseView` ali ser recusado pelo compilador,
 * antes mesmo da recusa no registro.
 */
type LadderStep<E extends RouteDefinition> =
  E["responses"][SuccessStatus<E>] extends { view: infer V }
    ? V extends readonly (infer Step)[]
      ? Step
      : never
    : never;

/**
 * Qual degrau da escada de capability este ator recebe.
 *
 * A entrada da tabela **declara** a escada; quem **decide** continua sendo a
 * API (`apps/api/docs/adr/0199-schemas-de-request-e-views-sao-codigo-do-contrato.md`),
 * e é por isso que a escolha entra pelo registro e não pela tabela. A
 * correspondência degrau → feature ainda é prosa em cada módulo: dar um dono a
 * ela é a issue 17 de `.scratch/fase-12-module-depth/`, e quando isso
 * acontecer é este ponto — um só — que passa a lê-la.
 */
export type ViewChooser<E extends RouteDefinition> = (
  actor: RouteActor<E>,
) => LadderStep<E>;

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
   * Os parâmetros precisam ter **tipo escrito** — uma função nomeada do módulo
   * (`auth.transport.ts` é a primeira) ou um arrow anotado. Um arrow que
   * dependesse do registrador para tipar `req`/`res` é *context-sensitive*, e o
   * TypeScript só o resolve depois de já ter fixado o contexto do handler: o
   * handler receberia o contexto vazio.
   */
  context?: (req: Request, res: Response) => C;
  /**
   * Obrigatório onde a entrada declara escada, recusado onde ela declara uma
   * view só — nos dois casos, no registro.
   */
  chooseView?: ViewChooser<E>;
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

/** A view de uma resposta, já resolvida para o ator que está sendo servido. */
type ViewFor<E extends RouteDefinition> = (actor: RouteActor<E>) => z.ZodType;

/**
 * Como chegar à view de cada status de sucesso, lido da entrada. Um status sem
 * `viewFor` é resposta sem corpo (204); com ele, é a função que dá a view
 * daquele ator — a mesma para todos quando a entrada declara uma view só, o
 * degrau escolhido quando ela declara a escada.
 *
 * Os dois desencontros entre a entrada e o registro — escada sem `chooseView`,
 * `chooseView` sem escada — falham **no registro**, na carga do módulo e não no
 * primeiro request, com o par método + path na mensagem.
 */
function viewsOf<E extends RouteDefinition>(
  entry: E,
  where: string,
  chooseView?: ViewChooser<E>,
) {
  const views = new Map<number, ViewFor<E> | undefined>();
  let hasLadder = false;

  for (const key of Object.keys(entry.responses)) {
    const status = Number(key);
    const view = entry.responses[status]?.view;

    if (isLadder(view)) {
      hasLadder = true;

      if (!chooseView) {
        throw new Error(
          `${where}: a view desta entrada é a escada de capability, e o ` +
            `registro não diz qual degrau cada ator recebe. Passe \`chooseView\` ` +
            `— adivinhar o degrau aqui é vazar campo.`,
        );
      }

      views.set(status, (actor) => {
        const step = chooseView(actor);

        // O degrau tem de ser um dos declarados: uma view de fora da escada
        // seria uma resposta que o contrato não descreve, e o cliente a
        // receberia como se descrevesse. O `LadderStep` já barra isso em
        // compilação; esta é a rede para o que o tipo não alcança — duas views
        // **estruturalmente iguais** são o mesmo tipo para o TS, e a
        // comparação aqui é por identidade. É por identidade de propósito: o
        // módulo tem de devolver o **mesmo objeto** que a tabela declara, e
        // reembrulhar a view (um `.clone()`, um `.extend()`) deixa de ser algo
        // que passa despercebido.
        if (!view.includes(step)) {
          throw createPresentationError({
            context: {
              route: where,
              reason: "A view escolhida não é um degrau da escada declarada",
            },
          });
        }

        return step;
      });

      continue;
    }

    views.set(status, view ? () => view : undefined);
  }

  if (chooseView && !hasLadder) {
    throw new Error(
      `${where}: o registro traz \`chooseView\`, mas esta entrada declara uma ` +
        `view só — não há degrau a escolher.`,
    );
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
  views: ReadonlyMap<number, unknown>,
  where: string,
): { status: number; body: unknown } {
  const outcome = result as { status?: unknown; body?: unknown } | null;
  const status =
    typeof outcome?.status === "number" ? outcome.status : undefined;

  if (status === undefined || !views.has(status)) {
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
  { before = [], context, chooseView, handler }: RouteRegistration<E, C>,
): void {
  // O par método + path, montado uma vez: nomeia a rota tanto na recusa do
  // registro quanto no contexto do erro de apresentação.
  const where = `${entry.method} ${entry.path}`;
  const views = viewsOf(entry, where, chooseView);
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

      // O ator, na forma que a entrada promete: `AuthUser` onde ela diz
      // `bearer` (chegar sem `req.user` ali é 401, e o handler não roda),
      // possivelmente ausente onde ela diz `public`.
      const actor = (
        entry.auth === "bearer" ? getAuthUser(req) : req.user
      ) as RouteActor<E>;

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

      const viewFor = views.get(status);

      if (!viewFor) {
        res.status(status).send();
        return;
      }

      res
        .status(status)
        .json(presentWith(viewFor(actor), body, { route: where }));
    } catch (error) {
      next(error);
    }
  };

  router[METHODS[entry.method]](entry.path, ...before, dispatch);
}
