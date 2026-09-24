import { routes } from "@pet-oasis/api-contracts/routes";
import { describe, expect, it } from "vitest";
import { buildPathsFromRouteTable } from "@/docs/adapter";

/**
 * Prova que o `/openapi.json` não sub-declara um status que `registerRoute`
 * garante estruturalmente — a issue 16 de `.scratch/fase-12-module-depth/`
 * achou catorze rotas com parâmetro que respondiam 422 e não o declaravam.
 * Roda contra a tabela real, sem servidor nem banco: `buildPathsFromRouteTable`
 * é pura.
 */

const entries = Object.entries(routes).flatMap(([domain, group]) =>
  Object.entries(group).map(([operation, route]) => ({
    id: `${domain}.${operation}`,
    route,
  })),
);

function toPathTemplate(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("buildPathsFromRouteTable — derivação de erros", () => {
  const paths = buildPathsFromRouteTable();

  it("declara 401 em toda rota bearer", () => {
    const offenders = entries
      .filter(({ route }) => route.auth === "bearer")
      .filter(({ route }) => {
        const operation =
          // biome-ignore lint/suspicious/noExplicitAny: acesso dinâmico ao documento montado, não ao contrato
          (paths as any)[toPathTemplate(route.path)]?.[
            route.method.toLowerCase()
          ];
        return !operation?.responses?.["401"];
      })
      .map(({ id }) => id);

    expect(offenders).toEqual([]);
  });

  it("declara 422 em toda rota com request", () => {
    const offenders = entries
      .filter(({ route }) => route.request !== undefined)
      .filter(({ route }) => {
        const operation =
          // biome-ignore lint/suspicious/noExplicitAny: acesso dinâmico ao documento montado, não ao contrato
          (paths as any)[toPathTemplate(route.path)]?.[
            route.method.toLowerCase()
          ];
        return !operation?.responses?.["422"];
      })
      .map(({ id }) => id);

    expect(offenders).toEqual([]);
  });

  it("não perde um erro que a rota declarou à mão", () => {
    const offenders = entries.flatMap(({ id, route }) => {
      const operation =
        // biome-ignore lint/suspicious/noExplicitAny: acesso dinâmico ao documento montado, não ao contrato
        (paths as any)[toPathTemplate(route.path)]?.[
          route.method.toLowerCase()
        ];
      return Object.keys(route.errors)
        .filter((status) => !operation?.responses?.[status])
        .map((status) => `${id} → ${status}`);
    });

    expect(offenders).toEqual([]);
  });

  it("mantém as duas rotas que expuseram o bug (mesmo path, um DELETE sem 422 antes)", () => {
    const assignRole = paths["/users/{userId}/roles/{roleId}"]?.post?.responses;
    const revokeRole =
      paths["/users/{userId}/roles/{roleId}"]?.delete?.responses;

    expect(assignRole?.["422"]).toBeDefined();
    expect(revokeRole?.["422"]).toBeDefined();
  });
});
