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
import { DEFAULT_ROLES } from "@/modules/role/role.constants";
import { roleViews } from "@/modules/role/role.presenter";
import { getRoleByName } from "@/modules/role/role.repository";

afterEach(async () => {
  await clearDatabase();
});

describe("GET /api/v1/roles", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/roles");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:role`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:role"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:role"`,
    });
  });

  it("should return 200 and list of roles if user has feature: `read:role`", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/roles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data.length).toBe(DEFAULT_ROLES.length);
    expect(response.body.meta).toEqual({});

    expect(response.body.data).toMatchView(z.array(roleViews.default));
  });
});

describe("GET /api/v1/roles/:id", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get(
      `/api/v1/roles/${faker.string.uuid()}`,
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:role`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:role"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:role"`,
    });
  });

  it("should return 403 if user does not have feature and tries to access a non existent role", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:role"`,
    });
  });

  it("should return 404 if role does not exist", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Role não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 422 if role id is a invalid uuid", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/roles/invalid-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["id"]);
  });

  it("should return 200 and role if user has feature: `read:role`", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const role = await getRoleByName("manager");

    if (!role)
      throw createNotFoundError({
        message: "Role não encontrado",
      });

    const response = await request(app)
      .get(`/api/v1/roles/${role.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(roleViews.default);

    expect(response.body).toMatchObject({
      name: role.name,
      id: role.id,
      description: role.description,
    });
  });
});
