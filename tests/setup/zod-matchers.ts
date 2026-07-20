import { expect } from "vitest";
import { z } from "zod";

function strictify(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => [
        key,
        strictify(value as z.ZodType),
      ]),
    );
    return z.strictObject(shape);
  }
  if (schema instanceof z.ZodArray) {
    return z.array(strictify(schema.element as z.ZodType));
  }
  if (schema instanceof z.ZodNullable) {
    return strictify(schema.unwrap() as z.ZodType).nullable();
  }
  if (schema instanceof z.ZodOptional) {
    return strictify(schema.unwrap() as z.ZodType).optional();
  }
  return schema;
}

expect.extend({
  toMatchView(received: unknown, view: z.ZodType) {
    const result = strictify(view).safeParse(received);

    if (result.success) {
      return {
        pass: true,
        message: () =>
          "Esperava que a resposta NÃO correspondesse à view, mas correspondeu",
      };
    }

    return {
      pass: false,
      message: () =>
        [
          "Resposta não corresponde à view esperada:",
          z.prettifyError(result.error),
          "",
          "Recebido:",
          JSON.stringify(received, null, 2),
        ].join("\n"),
    };
  },
});
