import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { describe, expect, it } from "vitest";

// Paridade das rotas: a tabela do contrato é a fonte de verdade dos paths, e
// este teste é o que impede o router do Express de divergir dela em silêncio.
// O par comparado é `MÉTODO path`, com o path na forma do **Express** (`:id`) —
// normalizar para `{id}` aqui esconderia justamente o erro de digitação que a
// comparação existe para pegar. Quem converte para o template do OpenAPI é o
// adaptador de `src/docs/`, e ele é exercido pelo `openapi.test.ts`.

// Rotas que vivem **fora** de `/api/v1`: são a superfície de documentação do
// próprio servidor, não do domínio, e por isso não entram na tabela do
// contrato. Ficam aqui, explícitas, para que uma rota nova fora do `/api/v1`
// fique vermelha até ser declarada — do mesmo jeito que `INTERNAL_ENUMS` no
// teste de paridade dos enums.
const SERVER_ROUTES = ["GET /openapi.json", "GET /scalar/standalone.js"];

const API_PREFIX = "/api/v1";

type RouterLayer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: RouterLayer[] };
  /** Prefixo de montagem, gravado pelo patch abaixo. */
  __mount?: string;
};

/**
 * O Express 5 não guarda o path de montagem na camada (o `Layer` só retém o
 * matcher compilado), então não há como ler `router.use("/users/:userId", …)`
 * depois do fato. A saída é gravar o prefixo **no momento da montagem**: o
 * patch abaixo envolve `Router.prototype.use` enquanto `@/routes` é importado
 * e anota nas camadas recém-empilhadas o path com que foram montadas. Sai do
 * ar logo em seguida — nenhum outro teste vê o router patcheado.
 */
async function loadRouterWithMounts() {
  const originalUse = Router.prototype.use;

  Router.prototype.use = function patchedUse(
    this: { stack: RouterLayer[] },
    ...args: Parameters<typeof originalUse>
  ) {
    const before = this.stack.length;
    const result = originalUse.apply(this, args);
    const mount = typeof args[0] === "string" ? args[0] : "/";
    for (let i = before; i < this.stack.length; i++) {
      const layer = this.stack[i];
      if (layer) layer.__mount = mount;
    }
    return result;
  } as typeof originalUse;

  try {
    const { router } = await import("@/routes");
    return router as unknown as { stack: RouterLayer[] };
  } finally {
    Router.prototype.use = originalUse;
  }
}

function collectExpressRoutes(stack: RouterLayer[], prefix: string): string[] {
  return stack.flatMap((layer) => {
    if (layer.route) {
      const path = `${prefix}${layer.route.path}`.replace(/\/$/, "") || "/";
      return Object.keys(layer.route.methods).map(
        (method) => `${method.toUpperCase()} ${path}`,
      );
    }
    if (layer.handle?.stack) {
      const mount = layer.__mount === "/" ? "" : (layer.__mount ?? "");
      return collectExpressRoutes(layer.handle.stack, `${prefix}${mount}`);
    }
    return [];
  });
}

function collectContractRoutes(): string[] {
  return Object.values(routes).flatMap((group) =>
    Object.values(group).map((route) => `${route.method} ${route.path}`),
  );
}

const router = await loadRouterWithMounts();
const allExpressRoutes = collectExpressRoutes(router.stack, "");

const expressRoutes = allExpressRoutes
  .filter((entry) => entry.includes(` ${API_PREFIX}`))
  .map((entry) => entry.replace(` ${API_PREFIX}`, " "))
  .sort();

const contractRoutes = collectContractRoutes().sort();

describe("paridade das rotas: contrato × router do Express", () => {
  it("não deixa rota fora de /api/v1 sem ser declarada", () => {
    const outside = allExpressRoutes
      .filter((entry) => !entry.includes(` ${API_PREFIX}`))
      .sort();

    expect(outside).toEqual([...SERVER_ROUTES].sort());
  });

  it("toda rota do Express tem entrada na tabela do contrato", () => {
    const missing = expressRoutes.filter(
      (entry) => !contractRoutes.includes(entry),
    );

    expect(missing).toEqual([]);
  });

  it("toda entrada da tabela do contrato tem rota no Express", () => {
    const missing = contractRoutes.filter(
      (entry) => !expressRoutes.includes(entry),
    );

    expect(missing).toEqual([]);
  });

  it("não repete o par método + path na tabela", () => {
    const duplicated = contractRoutes.filter(
      (entry, index) => contractRoutes.indexOf(entry) !== index,
    );

    expect(duplicated).toEqual([]);
  });
});
