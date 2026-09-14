import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "@/app";

describe("GET /openapi.json", () => {
  it("should be public (no token) and return 200 with JSON", async () => {
    const response = await request(app).get("/openapi.json");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("should be a valid OpenAPI 3.1 document served under /api/v1", async () => {
    const { body } = await request(app).get("/openapi.json");

    expect(body.openapi).toBe("3.1.0");
    expect(body.info?.title).toBe("Pet Oasis API");
    expect(body.servers?.[0]?.url).toBe("/api/v1");
    expect(body.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("should document representative public and protected routes", async () => {
    const { body } = await request(app).get("/openapi.json");

    expect(body.paths?.["/auth/login"]?.post).toBeDefined();
    expect(body.paths?.["/users"]?.get).toBeDefined();
    expect(body.paths?.["/roles"]?.get).toBeDefined();
    expect(body.paths?.["/breeds"]?.get).toBeDefined();

    // login é público (security: []); /users herda o bearer global
    expect(body.paths["/auth/login"].post.security).toEqual([]);
    expect(body.paths["/users"].get.security).toBeUndefined();
    // a vitrine do catálogo (9.1) é pública — sem isto o Scalar mostraria
    // cadeado e o "try it" exigiria token numa rota que responde sem ele
    expect(body.paths["/breeds"].get.security).toEqual([]);
  });

  it("should mark every catalog read as public and every catalog write as protected", async () => {
    const { body } = await request(app).get("/openapi.json");

    // As três rotas da 9.6 têm leitura pública e escrita sob feature no mesmo
    // path — é o par que justifica a autenticação opcional. Documentar só
    // metade faria o Scalar mentir sobre uma das duas.
    for (const path of ["/brands", "/categories", "/tags"]) {
      expect(body.paths[path].get.security).toEqual([]);
      expect(body.paths[path].post.security).toBeUndefined();
    }

    expect(body.paths["/brands/{brandId}"].patch).toBeDefined();
    expect(body.paths["/categories/{categoryId}"].delete).toBeDefined();
    expect(body.paths["/tags/{tagId}"].delete).toBeDefined();
  });

  it("should document the product reads as public and the writes as protected", async () => {
    const { body } = await request(app).get("/openapi.json");

    // O mesmo par das outras rotas de catálogo: leitura pública e escrita
    // protegida no mesmo recurso — é o que justifica a autenticação opcional,
    // e documentar só metade faria o Scalar mentir sobre a outra.
    expect(body.paths["/products"].get.security).toEqual([]);
    expect(body.paths["/products/{idOrSlug}"].get.security).toEqual([]);
    expect(body.paths["/products"].post.security).toBeUndefined();
    expect(body.paths["/products/{productId}"].patch).toBeDefined();
    expect(body.paths["/products/{productId}"].delete).toBeDefined();
    expect(body.paths["/products/{productId}/variants"].post).toBeDefined();
    expect(body.paths["/variants/{variantId}"].patch).toBeDefined();
    expect(body.paths["/variants/{variantId}"].delete).toBeDefined();
  });

  it("should document the search parameter and the search echo it adds", async () => {
    const { body } = await request(app).get("/openapi.json");

    const params = body.paths["/products"].get.parameters as {
      name: string;
      in: string;
    }[];
    expect(params.some((p) => p.in === "query" && p.name === "q")).toBe(true);

    // `meta.search` só existe nesta listagem (9.9/Z15): documentar o envelope
    // genérico aqui faria o Scalar prometer o campo em toda lista paginada.
    const meta =
      body.paths["/products"].get.responses["200"].content["application/json"]
        .schema.properties.meta;
    expect(meta.$ref).toBe("#/components/schemas/ProductListMeta");
    expect(
      body.components.schemas.ProductListMeta.properties.search,
    ).toBeDefined();
  });

  it("should emit the recursive category view without blowing up", async () => {
    const { body } = await request(app).get("/openapi.json");

    // A view de categoria se referencia em `children`; se o gerador não
    // resolvesse a recursão, o documento nem seria produzido.
    const category = body.components?.schemas?.Category;

    expect(category).toBeDefined();
    expect(category.properties?.children?.type).toBe("array");
  });

  it("should not leak sensitive fields anywhere in the document", async () => {
    const { text } = await request(app).get("/openapi.json");

    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain("refreshTokenHash");
  });

  it("documents the image uploads as multipart, with the 413 they can answer", async () => {
    const { body } = await request(app).get("/openapi.json");

    const uploads = [
      body.paths?.["/products/{productId}/images"]?.post,
      body.paths?.["/pets/{petId}/photo"]?.put,
      body.paths?.["/brands/{brandId}/logo"]?.put,
    ];

    for (const operation of uploads) {
      // Sem isto o Scalar renderiza um corpo JSON num endpoint que só aceita
      // multipart — e o "try it" nunca funcionaria.
      expect(
        operation?.requestBody?.content?.["multipart/form-data"],
      ).toBeDefined();
      expect(operation?.responses?.["413"]).toBeDefined();
      expect(operation?.security).toBeUndefined();
    }
  });

  it("should name the per-condition codes of the login 403 (10.8)", async () => {
    const { body } = await request(app).get("/openapi.json");

    // A resposta 403 do login é uma por condição, e o cliente ramifica pelo
    // `code`: a spec precisa nomeá-los, senão ficam só na prosa da API.
    const forbidden = body.paths["/auth/login"].post.responses["403"];
    expect(forbidden.description).toContain("ACCOUNT_BANNED");
    expect(forbidden.description).toContain("PASSWORD_RESET_REQUIRED");
    expect(forbidden.description).toContain("EMAIL_NOT_VERIFIED");
  });
});
