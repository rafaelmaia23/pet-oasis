import { faker } from "@faker-js/faker";
import request from "supertest";
import { afterEach, assert, describe, expect, it } from "vitest";
import {
  buildUser,
  buildUserWithFeatures,
  makeUserData,
} from "@/__tests__/factories/user.factory";
import {
  expectMatchesView,
  expectValidDate,
  expectValidUuid,
} from "@/__tests__/helpers/assertions";
import { loginAs } from "@/__tests__/helpers/auth";
import { clearDatabase } from "@/__tests__/helpers/database";
import app from "@/app";
import { verifyPassword } from "@/lib/password";
import { userViews } from "@/modules/user/user.presenter";
import { findUserById } from "@/modules/user/user.repository";

afterEach(async () => {
  await clearDatabase();
});

describe("POST /api/v1/users", () => {
  it("should return 400 if required fields are missing", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 400 if password does not meet requirements", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeUserData({ password: "weak" }));

    expect(response.status).toBe(400);
  });

  it("should return 400 if email is invalid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeUserData({ email: "invalid-email" }));

    expect(response.status).toBe(400);
  });

  it("should return 409 if email is already in use", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post("/api/v1/users")
      .send(userData)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Email já está em uso",
      action: "Tente outro email",
    });
  });

  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .post("/api/v1/users")
      .send(makeUserData());

    expect(response.status).toBe(401);
  });

  it("should return 403 if user does not have feature: `create:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeUserData());

    expect(response.status).toBe(403);
  });

  it("should return 201 and create a new user when provided valid data and user has feature: `create:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const newUserData = makeUserData();

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(newUserData);

    expect(response.status).toBe(201);

    expect(response.body).not.toHaveProperty("passwordHash");

    expect(response.body).toMatchObject({
      name: newUserData.name,
      email: newUserData.email,
    });

    expect(response.body).toMatchView(userViews.owner);

    expect(response.body.id).toBeDefined();
    expectValidUuid(response.body.id);

    const userInDb = await findUserById(response.body.id);

    assert(userInDb !== null, "User should be found in the database");

    expect(
      await verifyPassword(newUserData.password, userInDb.passwordHash),
    ).toBe(true);
    expect(await verifyPassword("wrong-password", userInDb.passwordHash)).toBe(
      false,
    );
  });
});

+describe("GET /api/v1/users", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/users");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:user:others`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  });

  it("should not authorize if user has only feature: `read:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  });

  it("should return 200 and list of users if user has feature: `read:user:others`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user:others"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
  });

  it("should return 200 with all users if user has feature: `read:user:others`", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();
    const userData3 = makeUserData();

    await buildUserWithFeatures(["read:user:others"], userData1);
    await buildUserWithFeatures([], userData2);
    await buildUserWithFeatures([], userData3);

    const token = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    console.log(response.body); // temporário

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
    expect(response.body.length).toBeGreaterThanOrEqual(3);
  });
});

describe("GET /api/v1/users/:id", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/users/some-id");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users/some-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user"',
    });
  });

  it("should return 400 if id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get("/api/v1/users/non-existing-id")
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

    await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and user data if user has feature: `read:user`", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["read:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expectMatchesView(response.body, userViews.default);

    expect(response.body).not.toHaveProperty("passwordHash");

    expect(response.body.name).toBe(userData.name);
    expect(response.body.email).toBe(userData.email);
  });

  it("should return 200 and user data if user has feature: `read:user:others`", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(
      ["read:user:others"],
      userData,
    );

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .get(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      id: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      createdAt: createdUser.createdAt.toISOString(),
      updatedAt: createdUser.updatedAt.toISOString(),
      passwordHash: createdUser.passwordHash,
      features: expect.arrayContaining([
        expect.objectContaining({
          userId: createdUser.id,
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
    });

    // TODO: assert passwordHash do not appear in the response body
    // expect(response.body).not.toHaveProperty("passwordHash");
  });

  it("should return 403 if user tries to access another user's data without `read:user:others` feature", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["read:user"], userData1);
    const createdUser2 = await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .get(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("should return 200 and update user data if user has feature: `update:user` and is the owner of the user", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const newName = "New Name";

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: newName });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      id: createdUser.id,
      name: newName,
      email: createdUser.email,
      createdAt: createdUser.createdAt.toISOString(),
      updatedAt: expect.any(String),
      passwordHash: createdUser.passwordHash,
    });

    //TODO assert passwordHash do not appear in the response body
    // expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(createdUser.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);

    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      createdUser.updatedAt.getTime(),
    );

    expect(updatedUserInDb.email).toBe(createdUser.email);
  });

  it("should return 200 and update user data if user has feature: `update:user:others`", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["update:user:others"], userData1);
    const createdUser2 = await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const newName = "New Name";

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`)
      .send({ name: newName });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      id: createdUser2.id,
      name: newName,
      email: createdUser2.email,
      createdAt: createdUser2.createdAt.toISOString(),
      updatedAt: expect.any(String),
      passwordHash: createdUser2.passwordHash,
    });

    //TODO assert passwordHash do not appear in the response body
    // expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(createdUser2.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);

    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      createdUser2.updatedAt.getTime(),
    );

    expect(updatedUserInDb.email).toBe(createdUser2.email);
  });

  it("should return 403 if user tries to update another user's data without `update:user:others` feature", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["update:user"], userData1);
    const createdUser2 = await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user:others"',
    });
  });

  it("should return 200 if user with update:user:others updates their own data", async () => {
    const userData = makeUserData();
    const createdUser = await buildUserWithFeatures(
      ["update:user:others"],
      userData,
    );
    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(200);
  });

  it("should return 200 if user updates email to the same email", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: userData.email }); // mesmo email atual

    expect(response.status).toBe(200);
  });

  it("should return 400 if no fields to update are provided", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 400 if id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch("/api/v1/users/non-existing-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
  });

  it("should return 401 if no auth token is provided", async () => {
    const response = await request(app)
      .patch("/api/v1/users/some-id")
      .send({ name: "New Name" });

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `update:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch("/api/v1/users/some-id")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user"',
    });
  });

  it("should return 400 if user tries to update password by this endpoint even if they have `update:user` feature", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewPassword123!" });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toMatchObject({
      field: "body.password",
      message: "Password cannot be updated through this endpoint",
    });
  });

  it("should return 400 if user tries to update password by this endpoint even if they have `update:user:others` feature", async () => {
    const userData = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["update:user:others"], userData);
    const createdUser2 = await buildUser(userData2);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewPassword123!" });

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Validation error",
    });
    expect(response.body.errors).toBeInstanceOf(Array);
    expect(response.body.errors.length).toBeGreaterThan(0);
    expect(response.body.errors[0]).toMatchObject({
      field: "body.password",
      message: "Password cannot be updated through this endpoint",
    });
  });

  it("should return 404 if user with given id does not exist", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["update:user:others"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .patch(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 409 if email is already in use by another user", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    const createdUser1 = await buildUserWithFeatures(
      ["update:user"],
      userData1,
    );
    await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser1.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`)
      .send({ email: userData2.email });

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Email já está em uso",
      action: "Tente outro email",
    });
  });

  it("should update all permited properties of the user are updated correctly", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["update:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const newUserData = makeUserData();

    const response = await request(app)
      .patch(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: newUserData.name,
        email: newUserData.email,
      });

    expect(response.status).toBe(200);

    expect(response.body).toEqual({
      id: createdUser.id,
      name: newUserData.name,
      email: newUserData.email,
      createdAt: createdUser.createdAt.toISOString(),
      updatedAt: expect.any(String),
      passwordHash: createdUser.passwordHash,
    });

    //TODO assert passwordHash do not appear in the response body
    // expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(createdUser.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newUserData.name);
    expect(updatedUserInDb.email).toBe(newUserData.email);
    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      createdUser.updatedAt.getTime(),
    );
  });
});

describe("DELETE /api/v1/users/:id", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete("/api/v1/users/some-id");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `delete:user`", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["create:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete("/api/v1/users/some-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user"',
    });
  });

  it("should return 400 if id is not a valid uuid", async () => {
    const userData = makeUserData();

    await buildUserWithFeatures(["delete:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete("/api/v1/users/non-existing-id")
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

    await buildUserWithFeatures(["delete:user:others"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 403 if user tries to access another user's data without `delete:user:others` feature", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["delete:user"], userData1);
    const createdUser2 = await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  });

  it("should return 204 and delete the user if user has feature: `delete:user` and is the owner of the user", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["delete:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const deletedUserInDb = await findUserById(createdUser.id);

    expect(deletedUserInDb).toBeNull();
  });

  it("should return 204 and delete the user if user has feature: `delete:user:others`", async () => {
    const userData1 = makeUserData();
    const userData2 = makeUserData();

    await buildUserWithFeatures(["delete:user:others"], userData1);
    const createdUser2 = await buildUser(userData2);

    const tokenUser1 = await loginAs(userData1.email, userData1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${createdUser2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`);

    expect(response.status).toBe(204);

    const deletedUserInDb = await findUserById(createdUser2.id);

    expect(deletedUserInDb).toBeNull();
  });

  it("should return 204 if user with delete:user:others deletes their own account", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(
      ["delete:user:others"],
      userData,
    );

    const token = await loginAs(userData.email, userData.password);

    const response = await request(app)
      .delete(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const deletedUserInDb = await findUserById(createdUser.id);

    expect(deletedUserInDb).toBeNull();
  });

  it("should invalidate the session after user deletion", async () => {
    const userData = makeUserData();

    const createdUser = await buildUserWithFeatures(["delete:user"], userData);

    const token = await loginAs(userData.email, userData.password);

    await request(app)
      .delete(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get(`/api/v1/users/${createdUser.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });
});
