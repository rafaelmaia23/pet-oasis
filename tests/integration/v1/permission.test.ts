import { faker } from "@faker-js/faker";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import app from "@/app";
import { createNotFoundError } from "@/errors/errorFactory";
import { prisma } from "@/lib/prisma";
import { getFeatureByName } from "@/modules/feature/feature.repository";
import { userFeatureViews } from "@/modules/permission/permission.presenter";
import type { RoleName } from "@/modules/role/role.constants";
import { roleViews } from "@/modules/role/role.presenter";
import { getRoleByName } from "@/modules/role/role.repository";
import { findUserById } from "@/modules/user/user.repository";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

const roleIdByName = async (name: RoleName) => {
  const role = await getRoleByName(name);

  if (!role) {
    throw createNotFoundError({ message: `Role "${name}" não encontrada` });
  }

  return role.id;
};

/** Overrides ativos do usuário — agora alcançados via `roles[].features[]` (D2). */
const activeOverrides = (user: Awaited<ReturnType<typeof findUserById>>) =>
  user?.roles.flatMap((userRole) => userRole.features) ?? [];

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

  it("should return 403 if user does not have feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 403 if user without `read:permission` tries to access non-existent user's features", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users/non-valid-id/features")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

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

  it("should return 200 and list the features of the user if the user has feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchView(z.array(userFeatureViews.default));
  });

  it("should return 200 and features of another user if request has feature: `read:permission`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchView(z.array(userFeatureViews.default));
  });
});

describe("GET /api/v1/users/:userId/roles", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/users/some-id/roles");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 403 if user without `read:permission` tries to access non-existent user's roles", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users/non-valid-id/roles")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and list the active roles of the user if the user has feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchView(z.array(roleViews.default));

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "manager" })]),
    );
  });

  it("should return 200 and the active roles of another user if requester has feature: `read:permission`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}/roles`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchView(z.array(roleViews.default));

    expect(response.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "attendant" })]),
    );
  });
});

describe("GET /api/v1/users/:userId/permissions", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get(
      "/api/v1/users/some-id/permissions",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 403 if user without `read:permission` tries to access non-existent user's permissions", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users/non-valid-id/permissions")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and the effective features of the user if the user has feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(z.array(z.string()));

    expect(response.body).toEqual(
      expect.arrayContaining(["manage:permission"]),
    );
  });

  it("should return 200 and the effective features of another user if requester has feature: `read:permission`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(z.array(z.string()));

    expect(response.body).toEqual(expect.arrayContaining(["read:user"]));
  });

  it("should not include a role feature that has been denied via override", async () => {
    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user"],
    });

    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .get(`/api/v1/users/${targetUser.id}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual(
      expect.arrayContaining(["update:user", "read:session"]),
    );

    expect(response.body).not.toEqual(expect.arrayContaining(["read:user"]));
  });

  it("should include a granted override feature not present in any role", async () => {
    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["read:role"],
    });

    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .get(`/api/v1/users/${targetUser.id}/permissions`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toEqual(expect.arrayContaining(["read:role"]));
  });
});

describe("POST /api/v1/users/:userId/roles/:roleId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).post(
      "/api/v1/users/some-id/roles/some-role-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/non-valid-id/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if role id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/roles/non-valid-role-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 404 if role with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 422 if role is incompatible with the user's active profile", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildCustomer();

    const token = await loginAs(actor.email, actor.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${targetUser.id}/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expect(response.body).toMatchObject({
      code: "VALIDATION_ERROR",
    });

    expect(response.body.action).toContain("employee");
  });

  it("should return 409 if user already has the active role", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(actor.email, actor.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${targetUser.id}/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Usuário já possui essa role",
      action: "Verifique as roles do usuário",
    });
  });

  it("should return 403 if a non admin role user tries to grant a privileged role (PERMISSION_FEATURES/wildcard) even with `manage:permission`", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(actor.email, actor.password);

    const adminRole = await getRoleByName("admin");

    if (!adminRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${targetUser.id}/roles/${adminRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem atribuir roles privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 201 if admin role user grants a privileged role to another user", async () => {
    const actor = await buildEmployee({
      roleNames: ["admin"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(actor.email, actor.password);

    const managerRole = await getRoleByName("manager");

    if (!managerRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${targetUser.id}/roles/${managerRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);

    expect(response.body).toMatchView(roleViews.default);

    expect(response.body).toMatchObject({ name: "manager" });

    const userInDb = await findUserById(targetUser.id);

    expect(userInDb).not.toBeNull();

    expect(userInDb?.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: expect.objectContaining({ name: "manager" }),
        }),
      ]),
    );
  });

  it("should return 201 if an actor with only `manage:permission` grants a non-privileged role", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildCustomer({
      roleNames: [],
    });

    const token = await loginAs(actor.email, actor.password);

    const customerRole = await getRoleByName("customer");

    if (!customerRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .post(`/api/v1/users/${targetUser.id}/roles/${customerRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(201);

    expect(response.body).toMatchView(roleViews.default);

    expect(response.body).toMatchObject({ name: "customer" });
  });
});

describe("DELETE /api/v1/users/:userId/roles/:roleId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/roles/some-role-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/non-valid-id/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if role id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/non-valid-role-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 404 if role with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if user does not have the given role active", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(actor.email, actor.password);

    const customerRole = await getRoleByName("customer");

    if (!customerRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${targetUser.id}/roles/${customerRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não possui essa role ativa",
      action: "Verifique as roles do usuário",
    });
  });

  it("should return 403 if a non admin role user tries to revoke a privileged role (PERMISSION_FEATURES/wildcard) even with `manage:permission`", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant", "manager"],
    });

    const token = await loginAs(actor.email, actor.password);

    const managerRole = await getRoleByName("manager");

    if (!managerRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${targetUser.id}/roles/${managerRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem atribuir roles privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 409 if the role is the last active role of the user's profile", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(actor.email, actor.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${targetUser.id}/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
    });

    expect(response.body.action).toContain("/users/:id/employee");
  });

  it("should return 204 and remove a non-privileged role keeping the others", async () => {
    const actor = await buildEmployee({
      roleNames: ["manager"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant", "manager"],
    });

    const token = await loginAs(actor.email, actor.password);

    const attendantRole = await getRoleByName("attendant");

    if (!attendantRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${targetUser.id}/roles/${attendantRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(targetUser.id);

    expect(userInDb).not.toBeNull();

    expect(userInDb?.roles).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: expect.objectContaining({ name: "attendant" }),
        }),
      ]),
    );

    expect(userInDb?.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: expect.objectContaining({ name: "manager" }),
        }),
      ]),
    );
  });

  it("should return 204 if admin role user revokes a privileged role from another user", async () => {
    const actor = await buildEmployee({
      roleNames: ["admin"],
    });

    const targetUser = await buildEmployee({
      roleNames: ["attendant", "manager"],
    });

    const token = await loginAs(actor.email, actor.password);

    const managerRole = await getRoleByName("manager");

    if (!managerRole) {
      throw createNotFoundError({ message: "Role não encontrada" });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${targetUser.id}/roles/${managerRole.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(targetUser.id);

    expect(userInDb).not.toBeNull();

    expect(userInDb?.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: expect.objectContaining({ name: "attendant" }),
        }),
      ]),
    );
  });
});

describe("PUT /api/v1/users/:userId/roles/:roleId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .put("/api/v1/users/some-id/roles/some-role-id/features/some-feature-id")
      .send({ granted: true });

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/non-valid-id/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if role id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(
        `/api/v1/users/${user.id}/roles/non-valid-role-id/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 422 if feature id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const response = await request(app)
      .put(
        `/api/v1/users/${user.id}/roles/${roleId}/features/non-valid-feature-id`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["featureId"]);
  });

  it("should return 422 if granted is missing or not a boolean", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: "not-a-boolean" });

    expect(response.status).toBe(422);

    expectValidationError(response, ["granted"]);

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response2.status).toBe(422);

    expectValidationError(response2, ["granted"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(
        `/api/v1/users/${faker.string.uuid()}/roles/${roleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const response = await request(app)
      .put(
        `/api/v1/users/${user.id}/roles/${roleId}/features/${faker.string.uuid()}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if role with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(
        `/api/v1/users/${user.id}/roles/${faker.string.uuid()}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Role não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 422 if the user does not have the given role active", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });

    // alvo é attendant: a role `manager` existe, mas ele não a tem.
    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(manager.email, manager.password);

    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 422 if the user's role assignment is soft-deleted", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const token = await loginAs(admin.email, admin.password);

    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const revoked = await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(revoked.status).toBe(204);

    const response = await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 200 and upsert the feature to another user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user2.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user2.id);

    expect(userInDb).not.toBeNull();

    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );

    const response2 = await request(app)
      .put(`/api/v1/users/${user2.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(200);

    expect(response2.body).toMatchView(userFeatureViews.default);

    const userInDb2 = await findUserById(user2.id);

    expect(userInDb2).not.toBeNull();

    expect(activeOverrides(userInDb2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: false,
        }),
      ]),
    );
  });

  it("should expose the role each override belongs to", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });

    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(admin.email, admin.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({
      role: { id: roleId, name: "attendant" },
      feature: { id: feature.id, name: "read:user:others" },
    });

    const list = await request(app)
      .get(`/api/v1/users/${target.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(list.status).toBe(200);

    expect(list.body.data).toEqual([
      expect.objectContaining({ role: { id: roleId, name: "attendant" } }),
    ]);
  });

  it("should return 200 and upsert the feature self user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user.id);

    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(200);

    expect(response2.body).toMatchView(userFeatureViews.default);

    const userInDb2 = await findUserById(user.id);

    expect(activeOverrides(userInDb2)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: false,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user tries to upsert a `PERMISSION_FEATURES` override from any user", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const attendantRoleId = await roleIdByName("attendant");
    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(
        `/api/v1/users/${user2.id}/roles/${attendantRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });

    const response2 = await request(app)
      .put(
        `/api/v1/users/${user.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(403);

    expect(response2.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 403 if a non admin role user tries to grant the wildcard override", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });

    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(manager.email, manager.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("*");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 200 if admin role user tries to upsert a `PERMISSION_FEATURES` override from another user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(admin.email, admin.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user.id);

    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user with `manage:permission` tries to upsert a `PERMISSION_FEATURES` override from any user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const adminToken = await loginAs(admin.email, admin.password);

    const userToken = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ granted: false });

    expect(response2.status).toBe(403);
  });

  it("should return 403 if a non admin manager tries to grant the privileged `read:audit-log:full` override", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(manager.email, manager.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:audit-log:full");

    if (!feature) {
      throw createNotFoundError({ message: "Feature não encontrada" });
    }

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 200 if a manager grants the non-privileged `read:audit-log` override", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(manager.email, manager.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:audit-log");

    if (!feature) {
      throw createNotFoundError({ message: "Feature não encontrada" });
    }

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchView(userFeatureViews.default);
  });

  it("should return 200 if an admin grants the privileged `read:audit-log:full` override", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(admin.email, admin.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("read:audit-log:full");

    if (!feature) {
      throw createNotFoundError({ message: "Feature não encontrada" });
    }

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchView(userFeatureViews.default);
  });
});

describe("DELETE /api/v1/users/:userId/roles/:roleId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/roles/some-role-id/features/some-feature-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const response = await request(app)
      .delete(
        `/api/v1/users/${user.id}/roles/${roleId}/features/some-feature-id`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 403 if user without `manage:permission` tries to remove feature from a non-existent user", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const response = await request(app)
      .delete(
        `/api/v1/users/${faker.string.uuid()}/roles/${roleId}/features/some-feature-id`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/non-valid-id/roles/${roleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if role id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/${user.id}/roles/non-valid-role-id/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleId"]);
  });

  it("should return 422 if feature id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const response = await request(app)
      .delete(
        `/api/v1/users/${user.id}/roles/${roleId}/features/non-valid-feature-id`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["featureId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/${faker.string.uuid()}/roles/${roleId}/features/${feature.id}`,
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
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const response = await request(app)
      .delete(
        `/api/v1/users/${faker.string.uuid()}/roles/${roleId}/features/${faker.string.uuid()}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist in user's override features", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("delete:user");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não possui essa feature override",
      action: "Verifique as features do usuário",
    });
  });

  // K5: 404 direto, sem checar a role antes — a resposta não revela se o
  // usuário tem ou não aquela role. Assimétrico com o PUT de propósito.
  it("should return 404 (not 422) if the user does not have the given role", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });

    const target = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["delete:user"],
    });

    const token = await loginAs(manager.email, manager.password);

    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("delete:user");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não possui essa feature override",
      action: "Verifique as features do usuário",
    });
  });

  it("should return 204 and remove the feature override from the user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["read:user:others"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(activeOverrides(userInDb)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 204 and remove the feature from other user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["delete:user"],
    });

    const token = await loginAs(user.email, user.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("delete:user");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/${user2.id}/roles/${roleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user2.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(activeOverrides(userInDb)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 204 if admin role user tries to remove a override of `PERMISSION_FEATURES` from another user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["manage:permission"],
    });

    const token = await loginAs(admin.email, admin.password);

    const roleId = await roleIdByName("attendant");

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/roles/${roleId}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(activeOverrides(userInDb)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user tries to remove a `PERMISSION_FEATURES` override from any user", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["manage:permission"],
    });

    const token = await loginAs(user.email, user.password);

    const attendantRoleId = await roleIdByName("attendant");
    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(
        `/api/v1/users/${user2.id}/roles/${attendantRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });

    const response2 = await request(app)
      .delete(
        `/api/v1/users/${user.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(403);

    expect(response2.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features privilegiadas",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });
});

describe("Escopo do override na atribuição de role (D2/D3/D6/D16)", () => {
  it("should cascade the role revocation to the overrides hanging on it", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    // duas roles de funcionário: o override vive só na `manager`.
    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const managerRoleId = await roleIdByName("manager");
    const attendantRoleId = await roleIdByName("attendant");

    const scopedFeature = await getFeatureByName("read:log");
    const otherFeature = await getFeatureByName("read:audit-log");

    if (!scopedFeature || !otherFeature)
      throw createNotFoundError({ message: "Feature não encontrada" });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${scopedFeature.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${otherFeature.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    const revoked = await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(revoked.status).toBe(204);

    const userInDb = await findUserById(target.id);

    // o override da role revogada morreu junto...
    expect(activeOverrides(userInDb)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: scopedFeature.id }),
      ]),
    );

    // ...e o da outra role continua vivo.
    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: otherFeature.id }),
      ]),
    );

    const effective = await request(app)
      .get(`/api/v1/users/${target.id}/permissions`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(effective.body).not.toContain("read:log");
    expect(effective.body).toContain("read:audit-log");
  });

  it("should record the cascaded override count on USER_ROLE_REVOKED", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:log");

    if (!feature)
      throw createNotFoundError({ message: "Feature não encontrada" });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const revokedRow = await prisma.auditLog.findFirst({
      where: { action: "USER_ROLE_REVOKED", targetId: target.id },
    });

    expect(revokedRow?.metadata).toMatchObject({ cascadedOverrides: 1 });
  });

  it("should reuse the same UserRole row when the role is granted again", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const managerRoleId = await roleIdByName("manager");

    const before = await prisma.userRole.findFirst({
      where: { userId: target.id, roleId: managerRoleId },
    });

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const regranted = await request(app)
      .post(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    // K4: re-conceder devolve 201, igual à primeira concessão.
    expect(regranted.status).toBe(201);

    const rows = await prisma.userRole.findMany({
      where: { userId: target.id, roleId: managerRoleId },
    });

    // D3: uma linha por par, para sempre.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(before?.id);
    expect(rows[0]?.deletedAt).toBeNull();
  });

  it("should restore the overrides of the role when an admin grants it again", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const managerRoleId = await roleIdByName("manager");

    const feature = await getFeatureByName("read:log");

    if (!feature)
      throw createNotFoundError({ message: "Feature não encontrada" });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    await request(app)
      .post(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const userInDb = await findUserById(target.id);

    // D6: tirar e devolver o cargo não zera os ajustes finos dele.
    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: feature.id, granted: true }),
      ]),
    );
  });

  it("should NOT restore a privileged override when the actor is not an admin (D16)", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    // manager tem `manage:permission`, então pode conceder/revogar a role
    // `attendant` — que não é privilegiada.
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const managerToken = await loginAs(manager.email, manager.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const attendantRoleId = await roleIdByName("attendant");

    const privileged = await getFeatureByName("read:audit-log:full");
    const ordinary = await getFeatureByName("read:audit-log");

    if (!privileged || !ordinary)
      throw createNotFoundError({ message: "Feature não encontrada" });

    // só o admin consegue pendurar a privilegiada.
    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${privileged.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${ordinary.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    const regranted = await request(app)
      .post(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    // a ação prossegue normalmente: quem não volta é o conteúdo privilegiado.
    expect(regranted.status).toBe(201);

    const userInDb = await findUserById(target.id);

    expect(activeOverrides(userInDb)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: ordinary.id }),
      ]),
    );

    expect(activeOverrides(userInDb)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ featureId: privileged.id }),
      ]),
    );

    // o descarte é silencioso na resposta: o audit é o único rastro (K3).
    const skipped = await prisma.auditLog.findMany({
      where: {
        action: "USER_PERMISSION_RESTORE_SKIPPED",
        targetId: target.id,
      },
    });

    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.metadata).toMatchObject({
      featureName: "read:audit-log:full",
      roleName: "attendant",
    });
  });

  it("should NOT restore an override that was removed on purpose before the role was revoked (D5)", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const managerRoleId = await roleIdByName("manager");

    const removedOnPurpose = await getFeatureByName("read:log");
    const cascaded = await getFeatureByName("read:audit-log");

    if (!removedOnPurpose || !cascaded)
      throw createNotFoundError({ message: "Feature não encontrada" });

    for (const feature of [removedOnPurpose, cascaded]) {
      await request(app)
        .put(
          `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${feature.id}`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ granted: true });
    }

    // Removido explicitamente: ganha um `deletedAt` próprio, que não vai bater
    // com o da role depois.
    await request(app)
      .delete(
        `/api/v1/users/${target.id}/roles/${managerRoleId}/features/${removedOnPurpose.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`);

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    await request(app)
      .post(`/api/v1/users/${target.id}/roles/${managerRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const userInDb = await findUserById(target.id);
    const activeFeatureIds = activeOverrides(userInDb).map((o) => o.featureId);

    expect(activeFeatureIds).toContain(cascaded.id);
    expect(activeFeatureIds).not.toContain(removedOnPurpose.id);
  });

  it("should keep a privileged override skipped by a non-admin dead forever, even for an admin (D16, §9.1.1)", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const adminToken = await loginAs(admin.email, admin.password);

    const manager = await buildEmployee({ roleNames: ["manager"] });
    const managerToken = await loginAs(manager.email, manager.password);

    const target = await buildEmployee({ roleNames: ["attendant", "manager"] });

    const attendantRoleId = await roleIdByName("attendant");

    const privileged = await getFeatureByName("read:audit-log:full");

    if (!privileged)
      throw createNotFoundError({ message: "Feature não encontrada" });

    await request(app)
      .put(
        `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${privileged.id}`,
      )
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    // T1: o manager revoga e reconcede — o privilegiado é pulado e fica com o
    // `deletedAt` de T1.
    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    await request(app)
      .post(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${managerToken}`);

    // T2: agora um **admin** revoga e reconcede. A role volta com um
    // `deletedAt` novo, que não bate com o T1 do override pulado.
    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    await request(app)
      .post(`/api/v1/users/${target.id}/roles/${attendantRoleId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const userInDb = await findUserById(target.id);

    // O descarte é permanente: só volta por concessão explícita.
    expect(activeOverrides(userInDb).map((o) => o.featureId)).not.toContain(
      privileged.id,
    );
  });

  it("should refuse a second active UserRole row for the same pair", async () => {
    const target = await buildEmployee({ roleNames: ["attendant"] });

    const attendantRoleId = await roleIdByName("attendant");

    // D3 tirou a unicidade do código e pôs no banco: nem escrita crua passa.
    await expect(
      prisma.userRole.create({
        data: { userId: target.id, roleId: attendantRoleId },
      }),
    ).rejects.toThrow();
  });
});

describe("Soft delete de overrides — efeito no cômputo", () => {
  describe("Soft delete de overrides — regressão de cômputo", () => {
    it("should make the feature return to role-based state after a deny override is soft-deleted", async () => {
      // attendant tem read:user pela role. Damos um DENY explícito, depois removemos o deny.
      // A feature deve VOLTAR (o deny soft-deletado não conta mais no cômputo).
      const admin = await buildEmployee({ roleNames: ["admin"] });
      const adminToken = await loginAs(admin.email, admin.password);

      // user-alvo: attendant (tem read:user pela role attendant)
      const target = await buildEmployee({ roleNames: ["attendant"] });
      const attendantRoleId = await roleIdByName("attendant");
      const feature = await getFeatureByName("read:user");
      if (!feature) throw new Error("Feature read:user não encontrada no seed");

      // 1. DENY explícito de read:user → feature deve sumir do efetivo
      await request(app)
        .put(
          `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${feature.id}`,
        )
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ granted: false });

      // confirma que o deny está ativo (a feature não está mais nas efetivas)
      const targetToken = await loginAs(target.email, target.password);
      const deniedResp = await request(app)
        .get(`/api/v1/users/${target.id}`)
        .set("Authorization", `Bearer ${targetToken}`);
      // attendant SEM read:user (negado) não consegue ler o próprio user → 403
      expect(deniedResp.status).toBe(403);

      // 2. Remove o override (soft delete do deny)
      const delResp = await request(app)
        .delete(
          `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${feature.id}`,
        )
        .set("Authorization", `Bearer ${adminToken}`);
      expect(delResp.status).toBe(204);

      // 3. A feature deve ter VOLTADO (deny soft-deletado não conta) → consegue ler de novo
      const restoredToken = await loginAs(target.email, target.password);
      const restoredResp = await request(app)
        .get(`/api/v1/users/${target.id}`)
        .set("Authorization", `Bearer ${restoredToken}`);
      expect(restoredResp.status).toBe(200);

      // confirma no banco: existe UserFeature deletado (histórico preservado)
      const allOverrides = await prisma.userFeature.findMany({
        where: { userRole: { userId: target.id }, featureId: feature.id },
      });
      expect(allOverrides.length).toBeGreaterThanOrEqual(1);
      expect(allOverrides.some((uf) => uf.deletedAt !== null)).toBe(true);
    });

    it("should reuse the same override row when it is granted again after a soft delete", async () => {
      const admin = await buildEmployee({ roleNames: ["admin"] });
      const adminToken = await loginAs(admin.email, admin.password);

      const target = await buildEmployee({ roleNames: ["attendant"] });
      const attendantRoleId = await roleIdByName("attendant");
      const feature = await getFeatureByName("read:user:others");
      if (!feature)
        throw new Error("Feature read:user:others não encontrada no seed");

      const url = `/api/v1/users/${target.id}/roles/${attendantRoleId}/features/${feature.id}`;

      // 1. GRANT
      const grant1 = await request(app)
        .put(url)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ granted: true });
      expect(grant1.status).toBe(200);

      // 2. DELETE (soft)
      const del = await request(app)
        .delete(url)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(del.status).toBe(204);

      // 3. GRANT de novo — o `@@unique` cobre a linha morta também, então não
      // nasce linha nova: a mesma é revivida.
      const grant2 = await request(app)
        .put(url)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ granted: true });
      expect(grant2.status).toBe(200);

      const overrides = await prisma.userFeature.findMany({
        where: { userRole: { userId: target.id }, featureId: feature.id },
      });

      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.deletedAt).toBeNull();
    });
  });
});
