import { breedViews } from "@pet-oasis/api-contracts/pet";
import { buildCustomer } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { PetSpecies } from "@/generated/prisma/enums";
import {
  DEFAULT_BREEDS,
  SRD_BREED_NAME,
} from "@/modules/breed/breed.constants";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

const dogBreedCount = DEFAULT_BREEDS.filter(
  (breed) => breed.species === PetSpecies.DOG,
).length;

describe("GET /api/v1/breeds", () => {
  it("should return 200 without any token — the catalog is public", async () => {
    // A asserção que prova a vitrine pública (9.1/N15): sem `Authorization`,
    // a rota responde 200 em vez do 401 que toda rota protegida daria.
    const response = await request(app).get("/api/v1/breeds");

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(DEFAULT_BREEDS.length);
    expect(response.body.meta).toEqual({});
    expect(response.body.data).toMatchView(z.array(breedViews.default));
  });

  it("should return 200 for an authenticated user as well", async () => {
    // A rota pública não pode quebrar para quem está logado — o cliente que
    // cadastra um pet chega aqui com token.
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/breeds")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(DEFAULT_BREEDS.length);
  });

  it("should filter by species and include the SRD row", async () => {
    const response = await request(app).get("/api/v1/breeds?species=DOG");

    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(dogBreedCount);
    expect(
      response.body.data.every(
        (breed: { species: string }) => breed.species === PetSpecies.DOG,
      ),
    ).toBe(true);
    expect(
      response.body.data.map((breed: { name: string }) => breed.name),
    ).toContain(SRD_BREED_NAME);
  });

  it("should return an empty list for a valid species with no breeds", async () => {
    // Espécie válida sem raça cadastrada não é erro: `SPECIES_WITH_BREED` é
    // explícita, e peixe simplesmente não está nela.
    const response = await request(app).get("/api/v1/breeds?species=FISH");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toEqual({});
  });

  it("should return 422 for a species outside the enum", async () => {
    const response = await request(app).get("/api/v1/breeds?species=GATO");

    expect(response.status).toBe(422);
    expectValidationError(response, ["species"]);
  });

  it("should order breeds alphabetically within a species", async () => {
    const response = await request(app).get("/api/v1/breeds?species=CAT");

    const names = response.body.data.map(
      (breed: { name: string }) => breed.name,
    );

    expect(names).toEqual(
      [...names].sort((a: string, b: string) => (a < b ? -1 : 1)),
    );
  });
});
