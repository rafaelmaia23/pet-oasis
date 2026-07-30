import { faker } from "@faker-js/faker";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "@/app";
import { meViews } from "@/modules/me/me.presenter";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

describe("GET /api/v1/me", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/me");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:user`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: 'Verifique se você tem acesso a feature "read:user"',
    });
  });

  it("should return 200 with the customer profile, its roles, and effective features", async () => {
    const user = await buildCustomer({
      roleNames: ["customer"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(meViews.default);

    expect(response.body).toMatchObject({
      id: user.id,
      name: user.name,
      email: user.email,
      cpf: user.cpf,
      employee: null,
    });

    expect(response.body.customer.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "customer" })]),
    );

    expect(response.body.features).toEqual(
      expect.arrayContaining(["read:user", "update:user", "delete:user"]),
    );
  });

  it("should return 200 with the employee profile, its roles, and effective features", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(meViews.default);

    expect(response.body.customer).toBeNull();

    expect(response.body.employee.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "attendant" })]),
    );

    expect(response.body.features).toEqual(
      expect.arrayContaining(["read:user", "update:user", "delete:user"]),
    );
  });

  it("should return 200 with both profiles populated, each with only its own roles", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const managerToken = await loginAs(manager.email, manager.password);

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const addCustomerResponse = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(addCustomerResponse.status).toBe(201);

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(meViews.default);

    expect(response.body.customer).not.toBeNull();
    expect(response.body.customer.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "customer" })]),
    );
    expect(response.body.customer.roles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "attendant" })]),
    );

    expect(response.body.employee).not.toBeNull();
    expect(response.body.employee.roles).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "attendant" })]),
    );
    expect(response.body.employee.roles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "customer" })]),
    );
  });

  it("should not include a soft-deleted profile", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const managerToken = await loginAs(manager.email, manager.password);

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const addCustomerResponse = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${managerToken}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(addCustomerResponse.status).toBe(201);

    const deleteCustomerResponse = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${managerToken}`);

    expect(deleteCustomerResponse.status).toBe(204);

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.customer).toBeNull();
    expect(response.body.employee).not.toBeNull();
  });

  it("should not include a role feature that has been denied via override", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["update:user"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.features).not.toEqual(
      expect.arrayContaining(["update:user"]),
    );
    expect(response.body.features).toEqual(
      expect.arrayContaining(["read:user", "read:session"]),
    );
  });

  it("should include a granted override feature not present in any role", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["read:role"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.features).toEqual(
      expect.arrayContaining(["read:role"]),
    );
  });

  it("should return 200 with the wildcard feature for an admin user", async () => {
    const user = await buildEmployee({
      roleNames: ["admin"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(meViews.default);

    expect(response.body.features).toEqual(expect.arrayContaining(["*"]));
  });
});
