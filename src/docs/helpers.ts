import type { z } from "zod";
import type {
  ZodObjectInput,
  ZodOpenApiOperationObject,
  ZodOpenApiParameters,
} from "zod-openapi";

type EnvelopeParts = Pick<
  ZodOpenApiOperationObject,
  "requestParams" | "requestBody"
>;

/**
 * Extrai as partes internas do envelope `z.object({ body?, params?, query? })`
 * usado pelos schemas de request, sem quebrar essa convenção: `params` → `path`,
 * `query` → `query`, `body` → requestBody JSON. Só emite o que existir.
 */
export function fromEnvelope<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): EnvelopeParts {
  const shape = schema.shape;
  const parts: EnvelopeParts = {};

  const requestParams: ZodOpenApiParameters = {};
  if (shape.params) {
    requestParams.path = shape.params as unknown as ZodObjectInput;
  }
  if (shape.query) {
    requestParams.query = shape.query as unknown as ZodObjectInput;
  }
  if (Object.keys(requestParams).length > 0) {
    parts.requestParams = requestParams;
  }

  if (shape.body) {
    parts.requestBody = {
      content: { "application/json": { schema: shape.body } },
    };
  }

  return parts;
}
