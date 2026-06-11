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
import { findFeatureByName } from "@/modules/feature/feature.repository";
import { findUserById } from "@/modules/user/user.repository";

afterEach(async () => {
  await clearDatabase();
});

describe("GET /api/v1/users/:userId/features", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/users/some-id/features");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:feature`", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:feature"`,
    });
  });

  it("should return 400 if user id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users/non-valid-id/features")
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
      .get(`/api/v1/users/${faker.string.uuid()}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and list the features of the user if the user has feature: `read:feature`", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(
      ["read:feature", "read:user"],
      userData,
    );

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toBeInstanceOf(Array);

    expect(response.body.length).toBe(2);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: user.id,
          featureId: expect.any(String),
          grantedAt: expect.any(String),
          feature: expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            createdAt: expect.any(String),
            description: expect.toBeOneOf([expect.any(String), null]),
          }),
        }),
      ]),
    );

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: expect.objectContaining({ name: "read:feature" }),
        }),
        expect.objectContaining({
          feature: expect.objectContaining({ name: "read:user" }),
        }),
      ]),
    );
  });

  it("should return 200 and features of another userif request has feature: `read:feature`", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["read:feature"], userData1);

    const user2 = await buildUserWithFeatures(
      ["read:user", "read:feature"],
      userData2,
    );

    const token = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toBeInstanceOf(Array);

    expect(response.body.length).toBe(2);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: user2.id,
          featureId: expect.any(String),
          grantedAt: expect.any(String),
          feature: expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            createdAt: expect.any(String),
            description: expect.toBeOneOf([expect.any(String), null]),
          }),
        }),
      ]),
    );

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          feature: expect.objectContaining({ name: "read:feature" }),
        }),
        expect.objectContaining({
          feature: expect.objectContaining({ name: "read:user" }),
        }),
      ]),
    );
  });
});

describe("POST /api/v1/users/:userId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).post(
      "/api/v1/users/some-id/features/some-feature-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:feature`", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/some-feature-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:feature"`,
    });
  });

  it("should return 400 if user id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .post(`/api/v1/users/non-valid-id/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 400 if feature id is not a valid uuid", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/non-valid-feature-id`)
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

    await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .post(
        `/api/v1/users/${faker.string.uuid()}/features/${manageFeature?.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 409 if user already has the feature assigned", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(
      ["manage:feature", "read:user:others"],
      userData,
    );

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("read:user:others");

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Usuário já possui essa feature",
      action: "Verifique as features do usuário",
    });
  });

  it("should return 201 and assign the feature to the user if request is valid", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const readUsersOthersFeature = await findFeatureByName("read:user:others");

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/${readUsersOthersFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      userId: user.id,
      featureId: readUsersOthersFeature?.id,
      grantedAt: expect.any(String),
    });

    const userInDb = await findUserById(user.id);

    expect(userInDb?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: readUsersOthersFeature?.id,
        }),
      ]),
    );
  });

  it("should return 201 and assign the feature to other the user if request is valid", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["manage:feature"], userData1);

    const user2 = await buildUserWithFeatures(["read:user"], userData2);

    const token = await loginAs(userData1.email, userData1.password);

    const readUsersOthersFeature = await findFeatureByName("read:user:others");

    const response = await request(app)
      .post(`/api/v1/users/${user2.id}/features/${readUsersOthersFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);

    expect(response.body).toMatchObject({
      userId: user2.id,
      featureId: readUsersOthersFeature?.id,
      grantedAt: expect.any(String),
    });

    const userInDb = await findUserById(user2.id);

    expect(userInDb?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: readUsersOthersFeature?.id,
        }),
      ]),
    );
  });

  it("should allow assigning manage:feature to another user", async () => {
    const adminData = makeUserData();
    const userData = makeUserData();

    await buildUserWithFeatures(["manage:feature"], adminData);
    const user = await buildUserWithFeatures([], userData);

    const token = await loginAs(adminData.email, adminData.password);
    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);
  });
});

describe("DELETE /api/v1/users/:userId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/features/some-feature-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:feature`", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["read:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/some-feature-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:feature"`,
    });
  });

  it("should return 400 if user id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .delete(`/api/v1/users/non-valid-id/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 400 if feature id is not a valid uuid", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/non-valid-feature-id`)
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

    await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .delete(
        `/api/v1/users/${faker.string.uuid()}/features/${manageFeature?.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist in user's features", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não possui essa feature",
      action: "Verifique as features do usuário",
    });
  });

  it("should return 204 and remove the feature from the user if request is valid", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(
      ["manage:feature", "read:user:others"],
      userData,
    );

    const token = await loginAs(userData.email, userData.password);

    const readUsersOthersFeature = await findFeatureByName("read:user:others");

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${readUsersOthersFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    expect(userInDb?.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: readUsersOthersFeature?.id,
        }),
      ]),
    );
  });

  it("should return 204 and remove the feature from other user if request is valid", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["manage:feature"], userData1);

    const user2 = await buildUserWithFeatures(["read:user:others"], userData2);

    const token = await loginAs(userData1.email, userData1.password);

    const readUsersOthersFeature = await findFeatureByName("read:user:others");

    const response = await request(app)
      .delete(
        `/api/v1/users/${user2.id}/features/${readUsersOthersFeature?.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user2.id);

    expect(userInDb?.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: readUsersOthersFeature?.id,
        }),
      ]),
    );
  });

  it("should allow removing manage:feature from another user", async () => {
    const adminData = makeUserData();
    const userData = makeUserData();

    await buildUserWithFeatures(["manage:feature"], adminData);
    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(adminData.email, adminData.password);
    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    expect(userInDb?.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: manageFeature?.id,
        }),
      ]),
    );
  });

  it("should return 403 if user tries to remove `manage:feature` from himself", async () => {
    const userData = makeUserData();

    const user = await buildUserWithFeatures(["manage:feature"], userData);

    const token = await loginAs(userData.email, userData.password);

    const manageFeature = await findFeatureByName("manage:feature");

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${manageFeature?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não pode remover sua própria permissão de gestão",
      action: "Solicite a outro administrador que faça essa alteração",
    });
  });
});
