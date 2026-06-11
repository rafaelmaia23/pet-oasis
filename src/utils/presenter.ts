// shared/presenter.ts
import type { z } from "zod";
import { createPresentationError } from "@/errors/errorFactory";

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

    const result = schema.safeParse(data);
    if (!result.success) {
      throw createPresentationError({
        cause: result.error,
        context: {
          view: String(view),
          ...extraContext,
          issues: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
      });
    }
    return result.data as z.output<Views[V]>;
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
