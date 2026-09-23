import { tagViews } from "@pet-oasis/api-contracts/catalog";
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

describe("GET /api/v1/tags", () => {
  it("should return 200 without any token and list tags ordered by name", async () => {
    await prisma.tag.createMany({
      data: [
        { name: "Promoção", slug: "promocao" },
        { name: "Filhote", slug: "filhote" },
      ],
    });

    const response = await request(app).get("/api/v1/tags");

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({});
    expect(response.body.data).toMatchView(z.array(tagViews.default));
    expect(response.body.data.map((tag: { name: string }) => tag.name)).toEqual(
      ["Filhote", "Promoção"],
    );
  });

  it("should return 200 with a malformed token instead of 401", async () => {
    const response = await request(app)
      .get("/api/v1/tags")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(response.status).toBe(200);
  });
});

describe("POST /api/v1/tags", () => {
  it("should return 401 without a token", async () => {
    const response = await request(app)
      .post("/api/v1/tags")
      .send({ name: "Promoção" });

    expect(response.status).toBe(401);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Promoção" });

    expect(response.status).toBe(403);
  });

  it("should return 201 and derive the slug from the name", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Promoção" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Promoção",
      slug: "promocao",
    });
    expect(response.body).toMatchView(tagViews.default);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "TAG_CREATED" },
    });
    expect(audit?.targetType).toBe("Tag");
    expect(audit?.targetId).toBe(response.body.id);
  });

  it("should return 409 for a duplicated name", async () => {
    const token = await loginAsCatalogManager();
    await prisma.tag.create({ data: { name: "Promoção", slug: "promocao" } });

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Promoção", slug: "promo" });

    expect(response.status).toBe(409);
  });

  it("should return 422 for a name that produces no usable slug", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "###" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["name"]);
  });

  it("should reject a description — a tag is only a label", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Promoção", description: "qualquer coisa" });

    expect(response.status).toBe(422);
  });
});

describe("PATCH /api/v1/tags/:tagId", () => {
  it("should rename without touching the frozen slug (W4)", async () => {
    const token = await loginAsCatalogManager();
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });

    const response = await request(app)
      .patch(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Oferta" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ name: "Oferta", slug: "promocao" });
  });

  it("should return 404 for a tag that does not exist", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .patch("/api/v1/tags/018f4e2a-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Oferta" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/v1/tags/:tagId", () => {
  it("should return 204 and HARD delete the tag (W5)", async () => {
    // A assimetria deliberada da 9.6: marca e categoria têm soft delete, tag
    // não. Rótulo transversal não participa de venda, então não há histórico a
    // preservar — e o nome fica livre para ser recriado.
    const token = await loginAsCatalogManager();
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });

    const response = await request(app)
      .delete(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.tag.findUnique({ where: { id: tag.id } });
    expect(inDb).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "TAG_DELETED" },
    });
    expect(audit?.targetId).toBe(tag.id);
  });

  it("should let the name be reused after a delete — nothing survives to collide", async () => {
    const token = await loginAsCatalogManager();
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });

    await request(app)
      .delete(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Promoção" });

    expect(response.status).toBe(201);
  });

  it("should return 404 when the tag is already gone", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .delete("/api/v1/tags/018f4e2a-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });

    const response = await request(app)
      .delete(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
