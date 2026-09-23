import { faker } from "@faker-js/faker";
import { petViews } from "@pet-oasis/api-contracts/pet";
import {
  buildPet,
  findSrdBreedId,
  makePetData,
} from "@tests/factories/pet.factory";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, assert, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { PetSex, PetSpecies } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

/** O `customerId` da rota é o id do **perfil**, que é o que `GET /me` devolve. */
async function buildCustomerWithProfile() {
  const user = await buildCustomer();

  assert(user.customer !== null, "Customer profile should exist");

  return { user, customerId: user.customer.id };
}

describe("POST /api/v1/customers/:customerId/pets", () => {
  it("should return 201 and create the pet for its own owner", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const data = await makePetData({ name: "Bidu" });

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(data);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ name: "Bidu", customerId });
    expect(response.body).toMatchView(petViews.default);

    // O dono cadastrando o próprio pet é `SELF`; o balcão, `STAFF`.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_CREATED" },
    });
    expect(audit?.targetType).toBe("Pet");
    expect(audit?.targetId).toBe(response.body.id);
    expect(audit?.metadata).toMatchObject({
      customerId,
      species: PetSpecies.DOG,
      source: "SELF",
    });
  });

  it("should record source STAFF when an attendant registers the pet", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData());

    expect(response.status).toBe(201);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_CREATED" },
    });
    expect(audit?.metadata).toMatchObject({ source: "STAFF" });
  });

  it("should never put the pet name in the audit metadata", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData({ name: "Rex" }));

    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_CREATED" },
    });

    expect(JSON.stringify(audit?.metadata)).not.toContain("Rex");
  });

  it("should return 403 when a customer registers a pet for someone else", async () => {
    const { user } = await buildCustomerWithProfile();
    const other = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${other.customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData());

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      action: 'Verifique se você tem acesso a feature "manage:pet:others"',
    });
    expect(await prisma.pet.count()).toBe(0);
  });

  it("should return 403 (not 404) for an unknown customer without the :others scope", async () => {
    // Fail-closed: sem `:others`, o inexistente responde igual ao alheio, senão
    // a rota vira oráculo de existência de customerId.
    const { user } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${faker.string.uuid()}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData());

    expect(response.status).toBe(403);
  });

  it("should return 404 for an unknown customer with the :others scope", async () => {
    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .post(`/api/v1/customers/${faker.string.uuid()}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData());

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Cliente não encontrado",
    });
  });

  it("should return 422 when a species that requires a breed comes without one", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bidu", species: PetSpecies.CAT });

    expect(response.status).toBe(422);
    expectValidationError(response, ["breedId"]);
  });

  it("should return 422 when a species without breeds comes with one", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nemo",
        species: PetSpecies.FISH,
        breedId: await findSrdBreedId(PetSpecies.DOG),
      });

    expect(response.status).toBe(422);
    expectValidationError(response, ["breedId"]);
  });

  it("should return 422 when the breed belongs to another species", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Mimi",
        species: PetSpecies.CAT,
        breedId: await findSrdBreedId(PetSpecies.DOG),
      });

    expect(response.status).toBe(422);
    expectValidationError(response, ["breedId"]);
  });

  it("should return 201 for a species without breeds when no breed is sent", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Nemo", species: PetSpecies.FISH });

    expect(response.status).toBe(201);
    expect(response.body.breed).toBeNull();
  });

  it("should return 409 for a duplicated microchip id", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const microchipId = "981098100123456";
    await buildPet(customerId, { microchipId });

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send(await makePetData({ microchipId }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ code: "CONFLICT" });
  });

  it("should return 422 for an unknown field in the body", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...(await makePetData()), deceasedAt: new Date().toISOString() });

    expect(response.status).toBe(422);
  });

  it("should return 401 without a token", async () => {
    const { customerId } = await buildCustomerWithProfile();

    const response = await request(app)
      .post(`/api/v1/customers/${customerId}/pets`)
      .send(await makePetData());

    expect(response.status).toBe(401);
  });
});

describe("GET /api/v1/customers/:customerId/pets", () => {
  it("should return 200 with the owner's pets in the list envelope", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { name: "Bidu" });
    await buildPet(customerId, { name: "Mimi", species: PetSpecies.CAT });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toEqual({});
    expect(response.body.data).toMatchView(z.array(petViews.default));
  });

  it("should keep a deceased pet in the owner's list", async () => {
    // Falecimento é estado, não exclusão: o pet continua existindo para o dono.
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].deceasedAt).not.toBeNull();
  });

  it("should omit a soft deleted pet from the list", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    await request(app)
      .delete(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toEqual([]);
  });

  it("should let staff read another customer's pets", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId);

    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .get(`/api/v1/customers/${customerId}/pets`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it("should return 403 when a customer lists someone else's pets", async () => {
    const { user } = await buildCustomerWithProfile();
    const other = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/customers/${other.customerId}/pets`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      action: 'Verifique se você tem acesso a feature "read:pet:others"',
    });
  });

  it("should return 422 for a non-uuid customer id", async () => {
    const { user } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/customers/not-a-uuid/pets")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
    expectValidationError(response, ["customerId"]);
  });
});

describe("GET /api/v1/pets", () => {
  /** Ator padrão da listagem geral: `attendant` tem `read:pet:others`. */
  async function loginAsStaff() {
    const staff = await buildEmployee({ roleNames: ["attendant"] });

    return loginAs(staff.email, staff.password);
  }

  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/pets");

    expect(response.status).toBe(401);
  });

  it("should return 403 for a customer without read:pet:others", async () => {
    // O cliente tem `read:pet` (vê os próprios), mas a listagem geral é de pet
    // de terceiro por definição — a feature é exigida direto na rota.
    const { user } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/pets")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      action: 'Verifique se você tem acesso a feature "read:pet:others"',
    });
  });

  it("should return 200 with pets of every customer in the offset envelope", async () => {
    const first = await buildCustomerWithProfile();
    const second = await buildCustomerWithProfile();
    await buildPet(first.customerId, { name: "Bidu" });
    await buildPet(second.customerId, {
      name: "Mimi",
      species: PetSpecies.CAT,
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data).toMatchView(z.array(petViews.default));
    expect(response.body.meta).toEqual({ page: 1, limit: 20, total: 2 });
  });

  it("should paginate with page/limit and report total in meta", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId);
    await buildPet(customerId);
    await buildPet(customerId);

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toEqual({ page: 1, limit: 2, total: 3 });
  });

  it("should return an empty page past the last one", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId);

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?page=999")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(1);
  });

  it("should reject a limit above the maximum with 422", async () => {
    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?limit=101")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["limit"]);
  });

  it("should omit a soft deleted pet from the list", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    await prisma.pet.update({
      where: { id: pet.id },
      data: { deletedAt: new Date() },
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  // ── Falecimento (V1: sem o parâmetro, a lista traz tudo) ──────────────────
  it("should include deceased pets when no deceased filter is given", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const alive = await buildPet(customerId);
    const dead = await buildPet(customerId);
    await prisma.pet.update({
      where: { id: dead.id },
      data: { deceasedAt: new Date() },
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets")
      .set("Authorization", `Bearer ${token}`);

    const ids = response.body.data.map((pet: { id: string }) => pet.id);
    expect(ids).toContain(alive.id);
    expect(ids).toContain(dead.id);
    expect(response.body.meta.total).toBe(2);
  });

  it("should list only deceased pets with ?deceased=true", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId);
    const dead = await buildPet(customerId);
    await prisma.pet.update({
      where: { id: dead.id },
      data: { deceasedAt: new Date() },
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?deceased=true")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(dead.id);
    expect(response.body.meta.total).toBe(1);
  });

  it("should exclude deceased pets with ?deceased=false", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const alive = await buildPet(customerId);
    const dead = await buildPet(customerId);
    await prisma.pet.update({
      where: { id: dead.id },
      data: { deceasedAt: new Date() },
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?deceased=false")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(alive.id);
  });

  // ── Filtros (V2) ──────────────────────────────────────────────────────────
  it("should filter by species", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { species: PetSpecies.DOG });
    const cat = await buildPet(customerId, { species: PetSpecies.CAT });

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?species=${PetSpecies.CAT}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(cat.id);
  });

  it("should filter by sex", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { sex: PetSex.MALE });
    const female = await buildPet(customerId, { sex: PetSex.FEMALE });

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?sex=${PetSex.FEMALE}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(female.id);
  });

  it("should filter by neutered", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { neutered: false });
    const neutered = await buildPet(customerId, { neutered: true });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?neutered=true")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(neutered.id);
  });

  it("should filter by breedId", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const catBreedId = await findSrdBreedId(PetSpecies.CAT);
    await buildPet(customerId, { species: PetSpecies.DOG });
    const cat = await buildPet(customerId, {
      species: PetSpecies.CAT,
      breedId: catBreedId,
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?breedId=${catBreedId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(cat.id);
  });

  it("should filter by customerId", async () => {
    const first = await buildCustomerWithProfile();
    const second = await buildCustomerWithProfile();
    await buildPet(first.customerId);
    const target = await buildPet(second.customerId);

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?customerId=${second.customerId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(target.id);
  });

  it("should filter by microchipId", async () => {
    // O caso de balcão: achou o bicho, quer o dono. Como `microchipId` é unique
    // global, o filtro devolve no máximo uma linha.
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { microchipId: "981098100000001" });
    const chipped = await buildPet(customerId, {
      microchipId: "981098100000002",
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?microchipId=981098100000002")
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(chipped.id);
  });

  it("should combine filters", async () => {
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId, { species: PetSpecies.CAT, neutered: false });
    await buildPet(customerId, { species: PetSpecies.DOG, neutered: true });
    const target = await buildPet(customerId, {
      species: PetSpecies.CAT,
      neutered: true,
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?species=${PetSpecies.CAT}&neutered=true`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(target.id);
  });

  it("should reject an unknown species value with 422", async () => {
    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?species=DRAGON")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["species"]);
  });

  it("should reject a non-uuid customerId with 422", async () => {
    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?customerId=not-a-uuid")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["customerId"]);
  });

  it("should return an empty list for a customerId that does not exist", async () => {
    // Filtro, não resolução de recurso: id bem-formado que não existe é lista
    // vazia, nunca 404.
    const { customerId } = await buildCustomerWithProfile();
    await buildPet(customerId);

    const token = await loginAsStaff();

    const response = await request(app)
      .get(`/api/v1/pets?customerId=${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBe(0);
  });

  // ── Ordenação (V3) ────────────────────────────────────────────────────────
  it("should sort by an allowlisted field ascending", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const first = await buildPet(customerId, { name: "Ana" });
    const middle = await buildPet(customerId, { name: "Bidu" });
    const last = await buildPet(customerId, { name: "Carla" });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?sort=name&order=asc")
      .set("Authorization", `Bearer ${token}`);

    const ids = response.body.data.map((pet: { id: string }) => pet.id);
    expect(ids).toEqual([first.id, middle.id, last.id]);
  });

  it("should keep createdAt desc as the default order when no sort is given", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const older = await buildPet(customerId);
    const newer = await buildPet(customerId);

    await prisma.pet.update({
      where: { id: older.id },
      data: { createdAt: new Date("2020-01-01T00:00:00.000Z") },
    });
    await prisma.pet.update({
      where: { id: newer.id },
      data: { createdAt: new Date("2030-01-01T00:00:00.000Z") },
    });

    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets")
      .set("Authorization", `Bearer ${token}`);

    const ids = response.body.data.map((pet: { id: string }) => pet.id);
    expect(ids).toEqual([newer.id, older.id]);
  });

  it("should reject a sort field outside the allowlist with 422", async () => {
    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?sort=microchipId")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["sort"]);
  });

  it("should reject order without sort with 422", async () => {
    const token = await loginAsStaff();

    const response = await request(app)
      .get("/api/v1/pets?order=asc")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["order"]);
  });

  it("should not skip nor repeat rows that share the sort value (id tiebreaker)", async () => {
    const { customerId } = await buildCustomerWithProfile();
    for (let i = 0; i < 5; i++) {
      await buildPet(customerId, { name: "Xarope" });
    }

    const token = await loginAsStaff();

    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const response = await request(app)
        .get(`/api/v1/pets?sort=name&limit=2&page=${page}`)
        .set("Authorization", `Bearer ${token}`);

      expect(response.body.meta.total).toBe(5);
      seen.push(...response.body.data.map((pet: { id: string }) => pet.id));
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });
});

describe("GET /api/v1/pets/:petId", () => {
  it("should return 200 for the owner", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId, { name: "Bidu" });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: pet.id, name: "Bidu" });
    expect(response.body).toMatchView(petViews.default);
    expect(response.body.breed).toMatchObject({ name: "SRD" });
  });

  it("should return 200 for staff with read:pet:others", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .get(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
  });

  it("should return 403 for another customer's pet", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const other = await buildCustomerWithProfile();
    const token = await loginAs(other.user.email, other.user.password);

    const response = await request(app)
      .get(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 403 (not 404) for an unknown pet without the :others scope", async () => {
    const { user } = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/pets/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 404 for an unknown pet with the :others scope", async () => {
    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .get(`/api/v1/pets/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ message: "Pet não encontrado" });
  });
});

describe("PATCH /api/v1/pets/:petId", () => {
  it("should return 200 and update the allowed fields", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bidu II", weightGrams: 9200, neutered: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      name: "Bidu II",
      weightGrams: 9200,
      neutered: true,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_UPDATED" },
    });
    expect(audit?.metadata).toMatchObject({
      customerId,
      fieldsChanged: ["name", "weightGrams", "neutered"],
    });
  });

  it("should return 200 when the species changes together with a compatible breed", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId, { species: PetSpecies.DOG });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        species: PetSpecies.CAT,
        breedId: await findSrdBreedId(PetSpecies.CAT),
      });

    expect(response.status).toBe(200);
    expect(response.body.species).toBe(PetSpecies.CAT);
  });

  it("should return 422 when the species changes leaving the old breed behind", async () => {
    // A validação corre sobre o estado resultante, não sobre o corpo isolado.
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId, { species: PetSpecies.DOG });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ species: PetSpecies.CAT });

    expect(response.status).toBe(422);
    expectValidationError(response, ["breedId"]);
  });

  it("should return 422 when the species changes to one without breeds keeping a breed", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId, { species: PetSpecies.DOG });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ species: PetSpecies.FISH });

    expect(response.status).toBe(422);
    expectValidationError(response, ["breedId"]);
  });

  it("should return 200 when the species changes to one without breeds clearing the breed", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId, { species: PetSpecies.DOG });
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ species: PetSpecies.FISH, breedId: null });

    expect(response.status).toBe(200);
    expect(response.body.breed).toBeNull();
  });

  it("should return 422 when the body tries to transfer the pet", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const other = await buildCustomerWithProfile();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ customerId: other.customerId });

    expect(response.status).toBe(422);
    expectValidationError(response, ["customerId"]);
  });

  it("should return 422 when the body carries deceasedAt", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ deceasedAt: new Date().toISOString() });

    expect(response.status).toBe(422);
    expectValidationError(response, ["deceasedAt"]);
  });

  it("should return 422 for an empty body", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);
  });

  it("should let staff with manage:pet:others edit another customer's pet", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(staff.email, staff.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ notes: "Cliente pediu retorno em 30 dias." });

    expect(response.status).toBe(200);
  });

  it("should return 403 for a viewer that can only read other people's pets", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    // `demo` tem `read:pet:others` e nenhuma feature de escrita.
    const viewer = await buildEmployee({ roleNames: ["demo"] });
    const token = await loginAs(viewer.email, viewer.password);

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Alterado" });

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/v1/pets/:petId", () => {
  it("should return 204 and soft delete the pet", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.pet.findUnique({ where: { id: pet.id } });
    expect(inDb?.deletedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_DELETED" },
    });
    expect(audit?.metadata).toMatchObject({ customerId });
  });

  it("should return 403 for another customer's pet", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const other = await buildCustomerWithProfile();
    const token = await loginAs(other.user.email, other.user.password);

    const response = await request(app)
      .delete(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});

describe("POST|DELETE /api/v1/pets/:petId/deceased", () => {
  it("should return 204 and record the death without deleting the pet", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.pet.findUnique({ where: { id: pet.id } });
    expect(inDb?.deceasedAt).not.toBeNull();
    expect(inDb?.deletedAt).toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: "PET_DECEASED" },
    });
    expect(audit?.metadata).toMatchObject({ customerId });
  });

  it("should keep the original date when marked twice", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    const first = await prisma.pet.findUnique({ where: { id: pet.id } });

    await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    const second = await prisma.pet.findUnique({ where: { id: pet.id } });

    expect(second?.deceasedAt).toEqual(first?.deceasedAt);
    expect(
      await prisma.auditLog.count({ where: { action: "PET_DECEASED" } }),
    ).toBe(1);
  });

  it("should undo the record on DELETE", async () => {
    const { user, customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .delete(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const inDb = await prisma.pet.findUnique({ where: { id: pet.id } });
    expect(inDb?.deceasedAt).toBeNull();
  });

  it("should return 403 for a viewer without manage:pet", async () => {
    const { customerId } = await buildCustomerWithProfile();
    const pet = await buildPet(customerId);
    const viewer = await buildEmployee({ roleNames: ["demo"] });
    const token = await loginAs(viewer.email, viewer.password);

    const response = await request(app)
      .post(`/api/v1/pets/${pet.id}/deceased`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });
});
