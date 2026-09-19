import { categoryViews } from "@pet-oasis/api-contracts/catalog";
import { buildProduct } from "@tests/factories/product.factory";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

/** Ramo de três níveis, o máximo permitido (9.6/W1). */
async function seedBranch() {
  const root = await prisma.category.create({
    data: { name: "Alimentação", slug: "alimentacao" },
  });
  const middle = await prisma.category.create({
    data: { name: "Ração", slug: "racao", parentId: root.id },
  });
  const leaf = await prisma.category.create({
    data: { name: "Ração seca", slug: "racao-seca", parentId: middle.id },
  });

  return { root, middle, leaf };
}

/** Um produto ativo pendurado na categoria — o que a torna inexcluível (9.7). */
async function seedProductIn(categoryId: string) {
  const brand = await prisma.brand.create({
    data: { name: "Golden", slug: "golden" },
  });

  return buildProduct(brand.id, categoryId);
}

describe("GET /api/v1/categories", () => {
  it("should return 200 without any token and nest children inside the parent", async () => {
    const { root, middle, leaf } = await seedBranch();

    const response = await request(app).get("/api/v1/categories");

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({});
    expect(response.body.data).toMatchView(z.array(categoryViews.default));

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(root.id);
    expect(response.body.data[0].children[0].id).toBe(middle.id);
    expect(response.body.data[0].children[0].children[0].id).toBe(leaf.id);
    expect(response.body.data[0].children[0].children[0].children).toEqual([]);
  });

  it("should return 200 with a malformed token instead of 401", async () => {
    const response = await request(app)
      .get("/api/v1/categories")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(response.status).toBe(200);
  });

  it("should order siblings by position and hide soft-deleted categories", async () => {
    await prisma.category.createMany({
      data: [
        { name: "Segunda", slug: "segunda", position: 1 },
        { name: "Primeira", slug: "primeira", position: 0 },
        { name: "Morta", slug: "morta", position: 2, deletedAt: new Date() },
      ],
    });

    const response = await request(app).get("/api/v1/categories");

    expect(
      response.body.data.map((category: { name: string }) => category.name),
    ).toEqual(["Primeira", "Segunda"]);
  });
});

describe("POST /api/v1/categories", () => {
  it("should return 401 without a token", async () => {
    const response = await request(app)
      .post("/api/v1/categories")
      .send({ name: "Higiene" });

    expect(response.status).toBe(401);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Higiene" });

    expect(response.status).toBe(403);
  });

  it("should return 201 for a root category and derive the slug", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Alimentação" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Alimentação",
      slug: "alimentacao",
      parentId: null,
      position: 0,
    });
    expect(response.body).toMatchView(categoryViews.default);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CATEGORY_CREATED" },
    });
    expect(audit?.targetType).toBe("Category");
    expect(audit?.targetId).toBe(response.body.id);
  });

  it("should return 201 for a third-level category", async () => {
    const token = await loginAsCatalogManager();
    const { middle } = await seedBranch();

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ração úmida", parentId: middle.id });

    expect(response.status).toBe(201);
    expect(response.body.parentId).toBe(middle.id);
  });

  it("should return 422 for a fourth level (W1)", async () => {
    // A regra que este teste protege: três níveis bastam para
    // "Alimentação > Ração > Ração seca", e um teto conhecido é o que deixa a
    // navegação previsível.
    const token = await loginAsCatalogManager();
    const { leaf } = await seedBranch();

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Grão pequeno", parentId: leaf.id });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should return 422 when the parent does not exist", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Órfã",
        parentId: "018f4e2a-0000-4000-8000-000000000000",
      });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should return 422 when the parent is soft-deleted", async () => {
    const token = await loginAsCatalogManager();
    const dead = await prisma.category.create({
      data: { name: "Morta", slug: "morta", deletedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Filha", parentId: dead.id });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should return 409 when the slug collides with another branch", async () => {
    // Consequência de W4 + W6: o slug é unique global e derivado do nome, então
    // dois "Camas" em ramos diferentes colidem. A saída é o slug explícito.
    const token = await loginAsCatalogManager();
    await prisma.category.create({ data: { name: "Camas", slug: "camas" } });

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Camas" });

    expect(response.status).toBe(409);
  });

  it("should accept an explicit slug to work around the collision", async () => {
    const token = await loginAsCatalogManager();
    await prisma.category.create({ data: { name: "Camas", slug: "camas" } });

    const response = await request(app)
      .post("/api/v1/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Camas", slug: "camas-para-gatos" });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe("camas-para-gatos");
  });
});

describe("PATCH /api/v1/categories/:categoryId", () => {
  it("should rename without touching the frozen slug (W4)", async () => {
    const token = await loginAsCatalogManager();
    const { root } = await seedBranch();

    const response = await request(app)
      .patch(`/api/v1/categories/${root.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Comida" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "Comida",
      slug: "alimentacao",
    });
  });

  it("should reparent a leaf to another root", async () => {
    const token = await loginAsCatalogManager();
    const { leaf } = await seedBranch();
    const other = await prisma.category.create({
      data: { name: "Higiene", slug: "higiene" },
    });

    const response = await request(app)
      .patch(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentId: other.id });

    expect(response.status).toBe(200);
    expect(response.body.parentId).toBe(other.id);
  });

  it("should return 422 when the category is set as its own parent", async () => {
    const token = await loginAsCatalogManager();
    const { middle } = await seedBranch();

    const response = await request(app)
      .patch(`/api/v1/categories/${middle.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentId: middle.id });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should return 422 when the new parent is one of its own descendants", async () => {
    // O ciclo clássico: pendurar a raiz na própria folha desconectaria o ramo
    // inteiro da árvore, e a leitura entraria em recursão infinita.
    const token = await loginAsCatalogManager();
    const { root, leaf } = await seedBranch();

    const response = await request(app)
      .patch(`/api/v1/categories/${root.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentId: leaf.id });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should return 422 when moving a subtree would exceed the depth limit", async () => {
    // O caso que a altura da subárvore existe para pegar: `middle` sozinho
    // caberia debaixo de `other`, mas ele carrega um filho junto — o resultado
    // teria três níveis abaixo de `other`, e não dois.
    const token = await loginAsCatalogManager();
    const { middle } = await seedBranch();

    const other = await prisma.category.create({
      data: { name: "Higiene", slug: "higiene" },
    });
    const otherChild = await prisma.category.create({
      data: { name: "Banho", slug: "banho", parentId: other.id },
    });

    const response = await request(app)
      .patch(`/api/v1/categories/${middle.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentId: otherChild.id });

    expect(response.status).toBe(422);
    expectValidationError(response, ["parentId"]);
  });

  it("should allow promoting a subtree to the root level", async () => {
    const token = await loginAsCatalogManager();
    const { middle } = await seedBranch();

    const response = await request(app)
      .patch(`/api/v1/categories/${middle.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentId: null });

    expect(response.status).toBe(200);
    expect(response.body.parentId).toBeNull();
  });

  it("should return 404 for a soft-deleted category", async () => {
    const token = await loginAsCatalogManager();
    const dead = await prisma.category.create({
      data: { name: "Morta", slug: "morta", deletedAt: new Date() },
    });

    const response = await request(app)
      .patch(`/api/v1/categories/${dead.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Viva" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/categories/:categoryId", () => {
  it("should return 409 when the category still has active children (W3)", async () => {
    // A decisão que este teste protege: sem cascata e sem reparenting — apagar
    // um pai não pode sumir com uma subárvore inteira sem o staff perceber.
    const token = await loginAsCatalogManager();
    const { root } = await seedBranch();

    const response = await request(app)
      .delete(`/api/v1/categories/${root.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    const inDb = await prisma.category.findUnique({ where: { id: root.id } });
    expect(inDb?.deletedAt).toBeNull();
  });

  it("should return 204 and soft delete a leaf", async () => {
    const token = await loginAsCatalogManager();
    const { leaf } = await seedBranch();

    const response = await request(app)
      .delete(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.category.findUnique({ where: { id: leaf.id } });
    expect(inDb?.deletedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "CATEGORY_DELETED" },
    });
    expect(audit?.targetId).toBe(leaf.id);
  });

  it("should let the parent be deleted once its only child is gone", async () => {
    const token = await loginAsCatalogManager();
    const { middle, leaf } = await seedBranch();

    await request(app)
      .delete(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .delete(`/api/v1/categories/${middle.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
  });

  it("should return 409 when an active product is still linked (W3, 9.7)", async () => {
    // A outra metade do W3, que só pôde nascer com `ProductCategory` (9.7).
    // Desvincular está fora de questão: violaria o mínimo de uma categoria por
    // produto, então a saída do staff é mover os produtos.
    const token = await loginAsCatalogManager();
    const { leaf } = await seedBranch();
    await seedProductIn(leaf.id);

    const response = await request(app)
      .delete(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    const inDb = await prisma.category.findUnique({ where: { id: leaf.id } });
    expect(inDb?.deletedAt).toBeNull();
  });

  it("should delete the category once the linked product is gone", async () => {
    const token = await loginAsCatalogManager();
    const { leaf } = await seedBranch();
    const product = await seedProductIn(leaf.id);
    await prisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });

    const response = await request(app)
      .delete(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
  });

  it("should return 404 when the category is already soft-deleted", async () => {
    const token = await loginAsCatalogManager();
    const dead = await prisma.category.create({
      data: { name: "Morta", slug: "morta", deletedAt: new Date() },
    });

    const response = await request(app)
      .delete(`/api/v1/categories/${dead.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const { leaf } = await seedBranch();

    const response = await request(app)
      .delete(`/api/v1/categories/${leaf.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
