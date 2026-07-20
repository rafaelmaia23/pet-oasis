import { faker } from "@faker-js/faker";
import { buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { createNotFoundError } from "@/errors/errorFactory";
import { DEFAULT_FEATURES } from "@/modules/feature/feature.constants";
import { featureViews } from "@/modules/feature/feature.presenter";
import { getFeatureByName } from "@/modules/feature/feature.repository";

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
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:feature"],
    });

    const token = await loginAs(user.email, user.password);

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
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/features")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.length).toBe(DEFAULT_FEATURES.length);

    expect(response.body).toMatchView(z.array(featureViews.default));
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
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

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

  it("should return 403 if user does not have feature and tries to access a non existent feature", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/features/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:feature"`,
    });
  });

  it("should return 422 if id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/features/non-valid-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["id"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

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
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:feature");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .get(`/api/v1/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(featureViews.default);

    expect(response.body).toMatchObject({
      name: feature.name,
      id: feature.id,
      description: feature.description,
    });
  });
});
