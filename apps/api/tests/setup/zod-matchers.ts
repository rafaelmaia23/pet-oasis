import { expect } from "vitest";
import { z } from "zod";

/**
 * Reescreve a view trocando todo objeto por `strictObject`, para que um campo a
 * mais na resposta reprove o match — é isso que faz `toMatchView` provar que
 * nada vazou, e não só que a forma bate.
 *
 * O `seen` existe por causa da view **recursiva** de categoria (9.6): ela se
 * referencia em `children`, e a travessia ansiosa estouraria a pilha. Ao
 * reentrar no mesmo schema, devolve um `z.lazy` que resolve para a versão
 * estrita quando ela terminar de ser montada — o mesmo truque que o Zod usa
 * para o tipo recursivo original.
 */
function strictify(
  schema: z.ZodType,
  seen: Map<z.ZodType, z.ZodType>,
): z.ZodType {
  const known = seen.get(schema);
  if (known) return known;

  if (schema instanceof z.ZodObject) {
    let built: z.ZodType | undefined;
    seen.set(
      schema,
      z.lazy(() => built as z.ZodType),
    );

    const shape = Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => [
        key,
        strictify(value as z.ZodType, seen),
      ]),
    );

    built = z.strictObject(shape);
    seen.set(schema, built);

    return built;
  }
  if (schema instanceof z.ZodArray) {
    return z.array(strictify(schema.element as z.ZodType, seen));
  }
  if (schema instanceof z.ZodNullable) {
    return strictify(schema.unwrap() as z.ZodType, seen).nullable();
  }
  if (schema instanceof z.ZodOptional) {
    return strictify(schema.unwrap() as z.ZodType, seen).optional();
  }
  return schema;
}

expect.extend({
  toMatchView(received: unknown, view: z.ZodType) {
    const result = strictify(view, new Map()).safeParse(received);

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
