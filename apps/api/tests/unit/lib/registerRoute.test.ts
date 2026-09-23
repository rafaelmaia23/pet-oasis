import type { RouteDefinition } from "@pet-oasis/api-contracts/routes";
import { makeAuthUser } from "@tests/factories/user.factory";
import express, { type RequestHandler, Router } from "express";
import request from "supertest";
import { describe, expect, it, type Mock, vi } from "vitest";
import { z } from "zod";
import type { AuthUser } from "@/lib/authorization";
import { type RouteHandlerContext, registerRoute } from "@/lib/registerRoute";
import { errorHandler } from "@/middlewares/error-handler.middleware";

/**
 * O registrador pela **própria interface**: uma entrada de tabela inventada
 * aqui e um handler falso. Nada de `@/app`, nada de banco — o que se prova é o
 * que o registrador deriva da entrada (path, método, parse do envelope, status
 * de sucesso e view) e o contrato que ele oferece ao handler.
 *
 * As entradas abaixo são de mentira de propósito: se o teste usasse
 * `routes.me.get`, ele passaria a falhar quando a rota de verdade mudasse, e
 * estaria provando a rota em vez do registrador. A ligação com a tabela real é
 * do typecheck (`satisfies RouteDefinition`) e dos testes de integração.
 */

const thingView = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: "TestThing" });

const readThing = {
  method: "GET",
  path: "/things/:id",
  tag: "Status",
  auth: "bearer",
  summary: "lê uma coisa",
  request: z.object({
    params: z.object({ id: z.uuid() }),
    query: z.object({ limit: z.coerce.number().int().optional() }),
  }),
  responses: { 200: { description: "a coisa", view: thingView } },
  errors: {},
} as const satisfies RouteDefinition;

const createThing = {
  method: "POST",
  path: "/things",
  tag: "Status",
  auth: "bearer",
  summary: "cria uma coisa",
  request: z.object({ body: z.object({ name: z.string().min(2) }) }),
  responses: { 201: { description: "criada", view: thingView } },
  errors: {},
} as const satisfies RouteDefinition;

const deleteThing = {
  method: "DELETE",
  path: "/things/:id",
  tag: "Status",
  auth: "bearer",
  summary: "apaga uma coisa",
  request: z.object({ params: z.object({ id: z.uuid() }) }),
  responses: { 204: { description: "apagada" } },
  errors: {},
} as const satisfies RouteDefinition;

const publicThing = {
  method: "GET",
  path: "/public-things",
  tag: "Status",
  auth: "public",
  summary: "lê sem token",
  responses: { 200: { description: "a coisa", view: thingView } },
  errors: {},
} as const satisfies RouteDefinition;

const ID = "11111111-1111-4111-8111-111111111111";
const THING = { id: ID, name: "coisa" };

/**
 * Uma aplicação mínima: o router registrado, o mesmo error handler da API e —
 * opcionalmente — um ator já autenticado. É o `authenticate` de verdade que
 * preenche `req.user` em produção; aqui ele é injetado, porque o que está sob
 * teste é o que o registrador faz com ele, não como ele chegou.
 */
function makeApp(register: (router: Router) => void, actor?: AuthUser) {
  const router = Router();
  register(router);

  const app = express();
  app.use(express.json());
  if (actor) {
    app.use(((req, _res, next) => {
      req.user = actor;
      next();
    }) as RequestHandler);
  }
  app.use(router);
  app.use(errorHandler);
  return app;
}

const someActor = () => makeAuthUser(["read:user"]);

/**
 * O handler falso, tipado pelo contexto que a entrada produz. O parâmetro não
 * está aqui só para o `mock.calls`: é ele que faz o typecheck reprovar um
 * handler que espere um campo que a entrada não declara.
 */
const spyOn = <E extends RouteDefinition, R>(
  _entry: E,
  result: R,
): Mock<(context: RouteHandlerContext<E>) => Promise<R>> =>
  vi.fn(async (_context: RouteHandlerContext<E>) => result);

describe("registerRoute", () => {
  describe("o que vem da entrada da tabela", () => {
    it("registra no método e no path que a entrada declara", async () => {
      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, { handler: async () => THING }),
        someActor(),
      );

      const found = await request(app).get(`/things/${ID}`);
      const wrongMethod = await request(app).post(`/things/${ID}`);

      expect(found.status).toBe(200);
      expect(wrongMethod.status).toBe(404);
    });

    it("responde o status de sucesso declarado na entrada", async () => {
      const app = makeApp(
        (router) =>
          registerRoute(router, createThing, { handler: async () => THING }),
        someActor(),
      );

      const response = await request(app).post("/things").send({ name: "ok" });

      expect(response.status).toBe(201);
    });

    it("sem view no status de sucesso, responde sem corpo", async () => {
      const handler = vi.fn(
        async (_context: RouteHandlerContext<typeof deleteThing>) => {},
      );
      const app = makeApp(
        (router) => registerRoute(router, deleteThing, { handler }),
        someActor(),
      );

      const response = await request(app).delete(`/things/${ID}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe("");
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("o envelope chega ao handler já validado", () => {
    it("entrega params e query parseados pelo schema da entrada", async () => {
      const handler = spyOn(readThing, THING);
      const app = makeApp(
        (router) => registerRoute(router, readThing, { handler }),
        someActor(),
      );

      await request(app).get(`/things/${ID}?limit=3`);

      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        params: { id: ID },
        // `3` e não `"3"`: quem coage é o schema da tabela, não o handler.
        query: { limit: 3 },
      });
    });

    it("entrega o body parseado pelo schema da entrada", async () => {
      const handler = spyOn(createThing, THING);
      const app = makeApp(
        (router) => registerRoute(router, createThing, { handler }),
        someActor(),
      );

      await request(app).post("/things").send({ name: "coisa" });

      expect(handler.mock.calls[0]?.[0]).toMatchObject({
        body: { name: "coisa" },
      });
    });

    it("envelope inválido vira 422 e o handler nunca roda", async () => {
      const handler = spyOn(readThing, THING);
      const app = makeApp(
        (router) => registerRoute(router, readThing, { handler }),
        someActor(),
      );

      const response = await request(app).get("/things/nao-e-uuid");

      expect(response.status).toBe(422);
      expect(response.body.errors).toHaveProperty("id");
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("o ator", () => {
    it("entrega o ator autenticado numa rota bearer", async () => {
      const actor = someActor();
      const handler = spyOn(readThing, THING);
      const app = makeApp(
        (router) => registerRoute(router, readThing, { handler }),
        actor,
      );

      await request(app).get(`/things/${ID}`);

      expect(handler.mock.calls[0]?.[0].actor).toBe(actor);
    });

    it("rota bearer sem ator é 401 — o handler não roda sem identidade", async () => {
      const handler = spyOn(readThing, THING);
      const app = makeApp((router) =>
        registerRoute(router, readThing, { handler }),
      );

      const response = await request(app).get(`/things/${ID}`);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("rota pública roda sem ator", async () => {
      const handler = spyOn(publicThing, THING);
      const app = makeApp((router) =>
        registerRoute(router, publicThing, { handler }),
      );

      const response = await request(app).get("/public-things");

      expect(response.status).toBe(200);
      expect(handler.mock.calls[0]?.[0].actor).toBeUndefined();
    });
  });

  describe("a view aplicada à resposta", () => {
    it("derruba o campo que a view não declara", async () => {
      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, {
            handler: async () => ({ ...THING, senha: "vazou" }),
          }),
        someActor(),
      );

      const response = await request(app).get(`/things/${ID}`);

      expect(response.body).toEqual(THING);
      expect(response.body).not.toHaveProperty("senha");
    });

    it("resposta que não satisfaz a view é erro de apresentação (500), não 422", async () => {
      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, {
            // Quem confere a forma da resposta é a view, em runtime: o tipo do
            // handler não a afirma (ver `HasResponseBody`), justamente porque o
            // dado que o serviço entrega é mais largo do que a view publica.
            handler: async () => ({ id: ID }),
          }),
        someActor(),
      );

      const response = await request(app).get(`/things/${ID}`);

      expect(response.status).toBe(500);
      expect(response.body.code).toBe("PRESENTATION_ERROR");
    });
  });

  describe("o que é do servidor entra por parâmetro", () => {
    it("roda os middlewares de `before` na ordem, antes do handler", async () => {
      const order: string[] = [];
      const step =
        (name: string): RequestHandler =>
        (_req, _res, next) => {
          order.push(name);
          next();
        };

      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, {
            before: [step("primeiro"), step("segundo")],
            handler: async () => {
              order.push("handler");
              return THING;
            },
          }),
        someActor(),
      );

      await request(app).get(`/things/${ID}`);

      expect(order).toEqual(["primeiro", "segundo", "handler"]);
    });

    it("um `before` que recusa impede o handler", async () => {
      const handler = spyOn(readThing, THING);
      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, {
            before: [
              (_req, res) => {
                res.status(403).json({ code: "FORBIDDEN" });
              },
            ],
            handler,
          }),
        someActor(),
      );

      const response = await request(app).get(`/things/${ID}`);

      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("erro do handler", () => {
    it("entrega ao error handler em vez de derrubar o processo", async () => {
      const app = makeApp(
        (router) =>
          registerRoute(router, readThing, {
            handler: async () => {
              throw new Error("explodiu");
            },
          }),
        someActor(),
      );

      const response = await request(app).get(`/things/${ID}`);

      expect(response.status).toBe(500);
    });
  });

  describe("entradas que o registrador ainda não sabe registrar", () => {
    it("recusa no registro a entrada com mais de um status de sucesso", () => {
      const twoSuccesses = {
        ...createThing,
        responses: {
          201: { description: "criada", view: thingView },
          202: { description: "aceita", view: thingView },
        },
      } as const satisfies RouteDefinition;

      expect(() =>
        registerRoute(Router(), twoSuccesses, { handler: async () => THING }),
      ).toThrow(/POST \/things/);
    });

    it("recusa no registro a entrada cuja view é uma escada", () => {
      const ladder = {
        ...readThing,
        responses: {
          200: { description: "a coisa", view: [thingView, thingView] },
        },
      } as const satisfies RouteDefinition;

      expect(() =>
        // O tipo do handler cai em `unknown` aqui: enquanto a escada não tem
        // dono (issue 17), o registrador não sabe dizer qual degrau devolver —
        // e é por isso que ele recusa a entrada em vez de adivinhar.
        registerRoute(Router(), ladder, { handler: async () => THING }),
      ).toThrow(/GET \/things\/:id/);
    });
  });
});
