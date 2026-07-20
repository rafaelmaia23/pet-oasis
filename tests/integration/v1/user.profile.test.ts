import { faker } from "@faker-js/faker";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import request from "supertest";
import { afterEach, assert, describe, expect, it } from "vitest";
import app from "@/app";
import { createNotFoundError } from "@/errors/errorFactory";
import { userViews } from "@/modules/user/user.presenter";
import { findUserById } from "@/modules/user/user.repository";

afterEach(async () => {
  await clearDatabase();
});

describe("POST /api/v1/users/:userId/customer", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .post("/api/v1/users/some-id/customer")
      .send({});

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature `create:profile`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "create:profile"',
    });
  });

  it("should return 403 if user does not have feature `create:profile` and tries to create a profile of non-existent user", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "create:profile"',
    });
  });

  it("should return 404 if user does not exist", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Usuário não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o ID do usuário",
    });
  });

  it("should return 409 if user already has a customer profile", async () => {
    const customer = await buildCustomer();

    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      message: "Usuário já possui um perfil de cliente",
      code: "CONFLICT",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 409 if user has a deleted customer profile", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response.status).toBe(201);

    const deleteResponse = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(204);

    const response2 = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response2.status).toBe(409);

    expect(response2.body).toMatchObject({
      code: "CONFLICT",
      message: "Usuário já possui um perfil de cliente inativo",
      action:
        "Verifique com o administrador do sistema para reativar o perfil de cliente",
    });
  });

  it("should return 422 if phone number is not provided or invalid", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${manager.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);

    expectValidationError(response, ["phone"]);

    const response2 = await request(app)
      .post(`/api/v1/users/${manager.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: "invalid-phone-number" });

    expect(response2.status).toBe(422);

    expectValidationError(response2, ["phone"]);
  });

  it("should return 201 and create a customer profile for the user", async () => {
    const employee = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(employee.email, employee.password);

    const response = await request(app)
      .post(`/api/v1/users/${employee.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        phone: faker.phone.number({ style: "international" }),
      });

    expect(response.status).toBe(201);

    expect(response.body).toMatchView(userViews.admin);

    const userInDb = await findUserById(employee.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.customer).toBeDefined();

    expect(userInDb.customer).toMatchObject({
      phone: response.body.customer.phone,
    });
  });
});

describe("POST /api/v1/users/:userId/employee", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .post("/api/v1/users/some-id/employee")
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature `create:profile`", async () => {
    const user = await buildCustomer();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${user.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "create:profile"',
    });
  });

  it("should return 403 if user does not have feature `create:profile` and tries to create a profile of non-existent user", async () => {
    const user = await buildCustomer();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "create:profile"',
    });
  });

  it("should return 404 if user does not exist", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Usuário não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o ID do usuário",
    });
  });

  it("should return 409 if user already has a employee profile", async () => {
    const employee = await buildEmployee();

    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${employee.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      message: "Usuário já possui um perfil de funcionário",
      code: "CONFLICT",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 409 if user has a deleted employee profile", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(201);

    const deleteResponse = await request(app)
      .delete(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(204);

    const response2 = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response2.status).toBe(409);

    expect(response2.body).toMatchObject({
      code: "CONFLICT",
      message: "Usuário já possui um perfil de funcionário inativo",
      action:
        "Verifique com o administrador do sistema para reativar o perfil de funcionário",
    });
  });

  it("should return 422 if roleNames is provided but invalid", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["invalid-role"] });

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleNames"]);
  });

  it("should return 422 if roleNames is provided but incompatible with employee profile", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["customer"] });

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleNames"]);
  });

  it("should return 201 and create a employee profile for the user", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response.status).toBe(201);

    expect(response.body).toMatchView(userViews.admin);

    const userInDb = await findUserById(customer.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.employee).toBeDefined();
  });

  it("should return 201 and create a employee profile with default role if none is provided", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(201);

    expect(response.body).toMatchView(userViews.admin);

    const userInDb = await findUserById(customer.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.employee).toBeDefined();
    expect(userInDb.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: expect.objectContaining({ name: "attendant" }),
        }),
        expect.objectContaining({
          role: expect.objectContaining({ name: "customer" }),
        }),
      ]),
    );
  });
});

describe("DELETE /api/v1/users/:userId/customer", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/customer",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature `delete:profile`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:profile"',
    });
  });

  it("should return 403 if user does not have feature `delete:profile` and tries to delete a profile of non-existent user", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:profile"',
    });
  });

  it("should return 404 if user does not exist", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Usuário não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o ID do usuário",
    });
  });

  it("should return 404 if user does not have a customer profile", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${manager.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Perfil de cliente não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 409 if user tries to delete the last profile of a user", async () => {
    const customer = await buildCustomer();

    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${customer.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Não é possível deletar o último perfil do usuário",
      action: "Para excluir esse usuario use o endpoint de deleção de usuário.",
    });
  });

  it("should return 409 if user tries to delete a profile that is already deleted", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const user = await buildEmployee();

    const response1 = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response1.status).toBe(201);

    const response2 = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(204);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Perfil de cliente já está inativo",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 422 if user id is not a valid UUID", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/invalid-uuid/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 204 and delete the customer profile of the user", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const user = await buildEmployee();

    const response1 = await request(app)
      .post(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({ phone: faker.phone.number({ style: "international" }) });

    expect(response1.status).toBe(201);

    const response2 = await request(app)
      .delete(`/api/v1/users/${user.id}/customer`)
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(204);

    const userInDb = await findUserById(user.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    if (!userInDb.customer) {
      throw createNotFoundError({
        message: "Perfil de cliente não encontrado",
      });
    }

    expect(userInDb.customer).toBeDefined();
    assert(
      userInDb.customer.deletedAt !== null,
      "deletedAt deveria estar preenchido",
    );
    expect(userInDb.customer.deletedAt > userInDb.customer.createdAt).toBe(
      true,
    );

    const activeRoleNames = userInDb.roles.map((r) => r.role.name);
    expect(activeRoleNames).toContain("attendant");
    expect(activeRoleNames).not.toContain("customer");
  });
});

describe("DELETE /api/v1/users/:userId/employee", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/employee",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature `delete:profile`", async () => {
    const user = await buildCustomer();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:profile"',
    });
  });

  it("should return 403 if user does not have feature `delete:profile` and tries to delete a profile of non-existent user", async () => {
    const user = await buildCustomer();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:profile"',
    });
  });

  it("should return 404 if user does not exist", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Usuário não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o ID do usuário",
    });
  });

  it("should return 404 if user does not have an employee profile", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const customer = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      message: "Perfil de funcionário não encontrado",
      code: "NOT_FOUND",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 409 if user tries to delete the last profile of a user", async () => {
    const employee = await buildEmployee();

    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/${employee.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);

    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "Não é possível deletar o último perfil do usuário",
      action: "Para excluir esse usuario use o endpoint de deleção de usuário.",
    });
  });

  it("should return 409 if user tries to delete a profile that is already deleted", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const customer = await buildCustomer();

    const response1 = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response1.status).toBe(201);

    const response2 = await request(app)
      .delete(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(204);

    const response3 = await request(app)
      .delete(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response3.status).toBe(409);

    expect(response3.body).toMatchObject({
      code: "CONFLICT",
      message: "Perfil de funcionário já está inativo",
      action: "Verifique o perfil do usuário",
    });
  });

  it("should return 422 if user id is not a valid UUID", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .delete(`/api/v1/users/invalid-uuid/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 204 and delete the employee profile of the user", async () => {
    const manager = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(manager.email, manager.password);

    const customer = await buildCustomer();

    const response1 = await request(app)
      .post(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    expect(response1.status).toBe(201);

    const response2 = await request(app)
      .delete(`/api/v1/users/${customer.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(204);

    const userInDb = await findUserById(customer.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    if (!userInDb.employee) {
      throw createNotFoundError({
        message: "Perfil de funcionário não encontrado",
      });
    }

    expect(userInDb.employee).toBeDefined();
    assert(
      userInDb.employee.deletedAt !== null,
      "deletedAt deveria estar preenchido",
    );
    expect(userInDb.employee.deletedAt > userInDb.employee.createdAt).toBe(
      true,
    );

    const activeRoleNames = userInDb.roles.map((r) => r.role.name);
    expect(activeRoleNames).toContain("customer");
    expect(activeRoleNames).not.toContain("attendant");
  });
});
