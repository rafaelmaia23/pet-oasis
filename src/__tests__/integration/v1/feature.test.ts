import { faker } from "@faker-js/faker";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildUserWithFeatures,
  makeUserData,
} from "@/__tests__/factories/user.factory";
import { loginAs } from "@/__tests__/helpers/auth";
import { clearDatabase } from "@/__tests__/helpers/database";
import app from "@/app";
import { DEFAULT_FEATURES } from "@/modules/feature/feature.constants";

afterEach(async () => {
  await clearDatabase();
});

describe("GET /api/v1/features", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/features");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:feature`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:feature"`,
    });
  });

  it("should return 200 and list of features if user has feature: `read:feature`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toBeInstanceOf(Array);

    expect(response.body.length).toBe(DEFAULT_FEATURES.length);

    expect(response.body[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      createdAt: expect.any(String),
      description: expect.any(String),
    });
  });
});

describe("GET /api/v1/features/:id", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/features/:id");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:feature`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/features/some-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:feature"`,
    });
  });

  it("should return 400 if id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/features/non-valid-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/features/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and a feature object if user has feature: `read:feature`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const featuresList = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${token}`);

    const validFeatureId = featuresList.body[0].id;

    const response = await request(app)
      .get(`/api/v1/features/${validFeatureId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      name: featuresList.body[0].name,
      id: validFeatureId,
      createdAt: featuresList.body[0].createdAt,
      description: featuresList.body[0].description,
    });
  });
});
