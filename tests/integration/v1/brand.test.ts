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
import { brandViews } from "@/modules/brand/brand.presenter";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

/** Quem escreve taxonomia tem `manage:catalog-structure` (9.1). */
async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

describe("GET /api/v1/brands", () => {
  it("should return 200 without any token — the storefront is public", async () => {
    await prisma.brand.create({ data: { name: "Golden", slug: "golden" } });

    const response = await request(app).get("/api/v1/brands");

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({});
    expect(response.body.data).toMatchView(z.array(brandViews.default));
  });

  it("should return 200 with a malformed token instead of 401", async () => {
    // O que distingue `optionalAuthenticate` do `authenticate`: token ruim é
    // indistinguível de visitante, e a vitrine responde igual nos dois casos.
    const response = await request(app)
      .get("/api/v1/brands")
      .set("Authorization", "Bearer not-a-real-jwt");

    expect(response.status).toBe(200);
  });

  it("should return 200 for an authenticated user as well", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("should list active brands ordered by name and hide the soft-deleted ones", async () => {
    await prisma.brand.createMany({
      data: [
        { name: "Zeta", slug: "zeta" },
        { name: "Alfa", slug: "alfa" },
        { name: "Morta", slug: "morta", deletedAt: new Date() },
      ],
    });

    const response = await request(app).get("/api/v1/brands");

    expect(
      response.body.data.map((brand: { name: string }) => brand.name),
    ).toEqual(["Alfa", "Zeta"]);
  });
});

describe("POST /api/v1/brands", () => {
  it("should return 401 without a token", async () => {
    const response = await request(app)
      .post("/api/v1/brands")
      .send({ name: "Golden" });

    expect(response.status).toBe(401);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Golden" });

    expect(response.status).toBe(403);
  });

  it("should return 201 and derive the slug from the name, without diacritics", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ração Golden", description: "Marca premium" });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Ração Golden",
      slug: "racao-golden",
      description: "Marca premium",
    });
    expect(response.body).toMatchView(brandViews.default);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "BRAND_CREATED" },
    });
    expect(audit?.targetType).toBe("Brand");
    expect(audit?.targetId).toBe(response.body.id);
  });

  it("should let an explicit slug win over the derived one", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Ração Golden", slug: "golden-oficial" });

    expect(response.status).toBe(201);
    expect(response.body.slug).toBe("golden-oficial");
  });

  it("should return 409 for a duplicated name", async () => {
    const token = await loginAsCatalogManager();
    await prisma.brand.create({ data: { name: "Golden", slug: "golden" } });

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Golden", slug: "outro-slug" });

    expect(response.status).toBe(409);
  });

  it("should return 409 when the name belongs to a soft-deleted brand (W6)", async () => {
    // O unique é global — o índice não enxerga `deletedAt`, como User.email e
    // Pet.microchipId. O 409 é o sinal "isto já existiu aqui".
    const token = await loginAsCatalogManager();
    await prisma.brand.create({
      data: { name: "Golden", slug: "golden", deletedAt: new Date() },
    });

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Golden", slug: "golden-2" });

    expect(response.status).toBe(409);
  });

  it("should return 422 for a name that produces no usable slug", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "!!!" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["name"]);
  });

  it("should return 422 for an empty name", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["name"]);
  });

  it("should return 422 for a slug that is not in slug format", async () => {
    const token = await loginAsCatalogManager();

    const response = await request(app)
      .post("/api/v1/brands")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Golden", slug: "Slug Com Espaço" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["slug"]);
  });
});

describe("PATCH /api/v1/brands/:brandId", () => {
  it("should rename without touching the frozen slug (W4)", async () => {
    // A decisão que este teste protege: renomear não muda a URL pública, senão
    // uma correção de digitação quebraria todo link externo.
    const token = await loginAsCatalogManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Golden Premium" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "Golden Premium",
      slug: "golden",
    });
  });

  it("should change the slug when it is sent explicitly", async () => {
    const token = await loginAsCatalogManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: "golden-premium" });

    expect(response.status).toBe(200);
    expect(response.body.slug).toBe("golden-premium");
  });

  it("should return 404 for a soft-deleted brand", async () => {
    const token = await loginAsCatalogManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden", deletedAt: new Date() },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Outro" });

    expect(response.status).toBe(404);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Outro" });

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/v1/brands/:brandId", () => {
  it("should return 204 and soft delete the brand", async () => {
    const token = await loginAsCatalogManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .delete(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.brand.findUnique({ where: { id: brand.id } });
    expect(inDb?.deletedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "BRAND_DELETED" },
    });
    expect(audit?.targetId).toBe(brand.id);
  });

  it("should return 404 when the brand is already soft-deleted", async () => {
    const token = await loginAsCatalogManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden", deletedAt: new Date() },
    });

    const response = await request(app)
      .delete(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 403 for a user without manage:catalog-structure", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .delete(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
