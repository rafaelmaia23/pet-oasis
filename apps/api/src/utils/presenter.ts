// shared/presenter.ts
import type { z } from "zod";
import { createPresentationError } from "@/errors/errorFactory";

/**
 * Aplica uma view a um dado de saída: o que a view não declara **não sai**, e
 * o que ela declara e não veio é falha de servidor (500), nunca 422 — o
 * request estava certo; quem desmentiu o contrato foi a resposta.
 *
 * É o único lugar que junta as duas coisas. O `createPresenter` abaixo o usa
 * para as views nomeadas de um módulo, e `@/lib/registerRoute` o usa para a
 * view que a entrada da tabela de rotas declara; sem isto o registrador
 * deixaria escapar um `ZodError` cru, que o error handler leria como erro de
 * validação do request e responderia 422.
 */
export function presentWith<S extends z.ZodType>(
  schema: S,
  data: unknown,
  context?: Record<string, unknown>,
): z.output<S> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw createPresentationError({
      cause: result.error,
      context: {
        ...context,
        issues: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          code: issue.code,
          message: issue.message,
        })),
      },
    });
  }

  return result.data;
}

export function createPresenter<Views extends Record<string, z.ZodType>>(
  views: Views,
) {
  function parseOrThrow<V extends keyof Views>(
    data: unknown,
    view: V,
    extraContext?: Record<string, unknown>,
  ): z.output<Views[V]> {
    const schema = views[view];
    if (!schema) {
      throw createPresentationError({
        context: {
          view: String(view),
          reason: "View não registrada no presenter",
        },
      });
    }

    return presentWith(schema, data, {
      view: String(view),
      ...extraContext,
    }) as z.output<Views[V]>;
  }

  return {
    views,
    present<V extends keyof Views>(data: unknown, view: V) {
      return parseOrThrow(data, view);
    },
    presentMany<V extends keyof Views>(items: unknown[], view: V) {
      return items.map((item, index) => parseOrThrow(item, view, { index }));
    },
  };
}
