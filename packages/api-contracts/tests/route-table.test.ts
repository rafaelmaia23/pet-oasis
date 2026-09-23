import { describe, expect, it } from "vitest";
import { z } from "zod";
import { routes } from "../src/routes/index";
import { ROUTE_TAGS } from "../src/routes/route.tags";
import type { RouteDefinition } from "../src/routes/route.types";

// Os invariantes da tabela de rotas, provados **no pacote que a possui**: são
// funções puras da tabela, então falham sem Postgres e sem aplicação de pé. O
// que sobra na API é o que precisa do servidor — a paridade com o router do
// Express e o documento OpenAPI de fato emitido.
//
// A travessia acontece **uma vez**, aqui: cada `it` lê a mesma lista plana de
// entradas em vez de percorrer a tabela de novo.

/** `true` só quando `T` é um literal — `string` largo reprova. */
type IsLiteral<T extends string> = string extends T ? false : true;

type Entry = {
  /** `user.get` — o mesmo nome que vira `operationId` no documento. */
  id: string;
  route: RouteDefinition;
};

const entries: Entry[] = Object.entries(routes).flatMap(([domain, group]) =>
  Object.entries(group).map(([operation, route]) => ({
    id: `${domain}.${operation}`,
    route: route as RouteDefinition,
  })),
);

/** `/customers/:customerId/pets/:petId` → `["customerId", "petId"]`. */
function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1] ?? "");
}

function shapeKeys(schema: z.ZodType): string[] {
  return schema instanceof z.ZodObject ? Object.keys(schema.shape) : [];
}

/** Tira `.optional()`/`.nullable()` de cima para chegar no que carrega forma. */
function unwrap(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrap(schema.unwrap() as z.ZodType);
  }
  return schema;
}

/**
 * Todo campo do degrau de baixo existe, com a mesma forma, no degrau de cima —
 * inclusive dentro de objeto aninhado e de array (as variantes do produto). O
 * degrau de cima pode acrescentar; nunca tirar nem trocar.
 */
function missingFields(lower: z.ZodType, upper: z.ZodType): string[] {
  const from = unwrap(lower);
  const to = unwrap(upper);

  if (from instanceof z.ZodObject) {
    if (!(to instanceof z.ZodObject)) return ["<objeto virou outra coisa>"];
    const upperShape = to.shape as Record<string, z.ZodType>;
    return Object.entries(from.shape as Record<string, z.ZodType>).flatMap(
      ([key, field]) => {
        const counterpart = upperShape[key];
        if (!counterpart) return [key];
        return missingFields(field, counterpart).map(
          (nested) => `${key}.${nested}`,
        );
      },
    );
  }

  if (from instanceof z.ZodArray) {
    if (!(to instanceof z.ZodArray)) return ["<array virou outra coisa>"];
    return missingFields(
      from.element as z.ZodType,
      to.element as z.ZodType,
    ).map((nested) => `[].${nested}`);
  }

  return [];
}

/** As escadas declaradas em respostas: `view` como array é escada. */
const ladders = entries.flatMap(({ id, route }) =>
  Object.entries(route.responses).flatMap(([status, response]) =>
    Array.isArray(response.view)
      ? [
          {
            id: `${id} ${status}`,
            steps: response.view as readonly z.ZodType[],
          },
        ]
      : [],
  ),
);

describe("tabela de rotas", () => {
  it("percorre pelo menos uma entrada por domínio", () => {
    expect(entries.length).toBe(
      Object.values(routes).reduce(
        (total, group) => total + Object.keys(group).length,
        0,
      ),
    );
    expect(entries.length).toBeGreaterThan(0);
  });

  it("declara `path`, `tag` e `summary` como literais", () => {
    // Prova de **tipo**, não de runtime: se um grupo perder o `as const`, o
    // campo volta a ser `string`, `IsLiteral` vira `false` e a linha para de
    // compilar. É o que o cliente HTTP precisa para montar a URL de uma rota
    // com `:param` sob o olho do compilador — e o que nenhuma asserção de
    // runtime alcança.
    const path: IsLiteral<typeof routes.user.get.path> = true;
    const tag: IsLiteral<typeof routes.user.get.tag> = true;
    const summary: IsLiteral<typeof routes.status.get.summary> = true;

    expect([path, tag, summary]).toEqual([true, true, true]);
  });

  it("casa os `:param` do path com as chaves do `params` do request", () => {
    // Nos dois sentidos: um `:param` sem chave chega ao handler sem validação,
    // e uma chave sem `:param` no path é validação que nunca roda — as duas
    // formas de a URL e o schema discordarem.
    const offenders = entries.flatMap(({ id, route }) => {
      const declared = shapeKeys(
        (route.request?.shape.params as z.ZodType | undefined) ?? z.object({}),
      );
      const inPath = pathParams(route.path);

      return [
        ...inPath
          .filter((param) => !declared.includes(param))
          .map((param) => `${id} → :${param} sem chave em params`),
        ...declared
          .filter((key) => !inPath.includes(key))
          .map((key) => `${id} → params.${key} sem :param no path`),
      ];
    });

    expect(offenders).toEqual([]);
  });

  it("só usa `body`, `params` e `query` no envelope de request", () => {
    const offenders = entries.flatMap(({ id, route }) =>
      Object.keys(route.request?.shape ?? {})
        .filter((key) => !["body", "params", "query"].includes(key))
        .map((key) => `${id} → ${key}`),
    );

    expect(offenders).toEqual([]);
  });

  it("usa exatamente as tags declaradas, nos dois sentidos", () => {
    const used = [...new Set(entries.map(({ route }) => route.tag))];

    expect(used).toEqual([...ROUTE_TAGS]);
  });

  it("mantém cada escada de views contida no degrau seguinte", () => {
    expect(ladders.length).toBeGreaterThan(0);

    const offenders = ladders.flatMap(({ id, steps }) =>
      steps.slice(1).flatMap((step, index) => {
        const lower = steps[index] as z.ZodType;
        return missingFields(lower, step).map(
          (field) => `${id} · degrau ${index + 1} perdeu ${field}`,
        );
      }),
    );

    expect(offenders).toEqual([]);
  });
});
