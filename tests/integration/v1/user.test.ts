import { faker } from "@faker-js/faker";
import {
  buildCustomer,
  buildEmployee,
  makeEmployeeData,
} from "@tests/factories/user.factory";
import {
  expectValidationError,
  expectValidUuid,
} from "@tests/helpers/assertions";
import { loginAs, loginWithSession } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import z from "zod";
import app from "@/app";
import { env } from "@/config/env";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { userViews } from "@/modules/user/user.presenter";
import {
  findDeletedUserById,
  findUserById,
} from "@/modules/user/user.repository";

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@/lib/email", () => ({ send: sendMock }));

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

describe("POST /api/v1/users", () => {
  it("should return 422 if required fields are missing", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);

    expectValidationError(response);
  });

  it("should return 422 if password does not meet requirements", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ password: "short" }));

    expect(response.status).toBe(422);

    expectValidationError(response, ["password"]);
  });

  it("should return 422 if email is invalid", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ email: "invalid-email" }));

    expect(response.status).toBe(422);

    expectValidationError(response, ["email"]);
  });

  it("should return 422 if cpf is invalid", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ cpf: "1a5,6ff.qwe-4t" }));

    expect(response.status).toBe(422);

    expectValidationError(response, ["cpf"]);
  });

  it("should return 422 if roles provided are invalid", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ roleNames: ["customer"] }));

    expect(response.status).toBe(422);

    expectValidationError(response, ["roleNames"]);
  });

  it("should return 409 if email is already in use", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ email: user.email }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "O email informado já está em uso",
      action: "Tente outro valor para o campo email",
    });
  });

  it("should return 409 if cpf is already in use", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData({ cpf: user.cpf }));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "CONFLICT",
      message: "O cpf informado já está em uso",
      action: "Tente outro valor para o campo cpf",
    });
  });

  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .post("/api/v1/users")
      .send(makeEmployeeData());

    expect(response.status).toBe(401);
  });

  it("should return 403 if user does not have feature: `create: user`", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(makeEmployeeData());

    expect(response.status).toBe(403);
  });

  it("should return 201 and create a new user when provided valid data and user has feature: `create: user`", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const newUserData = makeEmployeeData();

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

    expect(response.body).toMatchView(userViews.admin);

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

  it("should create the user as PENDING and emit an email verification token", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    sendMock.mockClear();

    const newUserData = makeEmployeeData();

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send(newUserData);

    expect(response.status).toBe(201);

    const userInDb = await findUserById(response.body.id);
    assert(userInDb !== null, "User should be found in the database");
    expect(userInDb.status).toBe("PENDING");

    const tokens = await prisma.verificationToken.findMany({
      where: { userId: userInDb.id },
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.purpose).toBe("EMAIL_VERIFICATION");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: newUserData.email }),
    );
  });
});

describe("GET /api/v1/users", () => {
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
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user:others"],
    });

    const token = await loginAs(user.email, user.password);

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

  it("should return 403 if user have base feature but not the privilege", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user:others"],
    });

    const token = await loginAs(user.email, user.password);

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

  it("should return 200 and list of users if user has feature: `read: user: others`", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchView(z.array(userViews.admin));
    expect(response.body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("should return 200 with all users if user has feature: `read: user: others`", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });
    await buildEmployee({ roleNames: ["attendant"] });
    await buildEmployee({ roleNames: ["admin"] });

    const token = await loginAs(user.email, user.password);
    const response = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    expect(response.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it("should paginate with page/limit and report total in meta", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });
    await buildEmployee({ roleNames: ["attendant"] });
    await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users?page=1&limit=2")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.meta).toMatchObject({ page: 1, limit: 2 });
    expect(response.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  it("should return an empty page (200, data: []) past the last page", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users?page=999&limit=20")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("should reject a limit above the maximum with 422", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users?limit=101")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["limit"]);
  });

  it("should filter by status", async () => {
    // buildEmployee defaults to ACTIVE; the customer below is PENDING
    const admin = await buildEmployee({ roleNames: ["manager"] });
    const pendingUser = await buildCustomer({ status: "PENDING" });

    const token = await loginAs(admin.email, admin.password);

    const response = await request(app)
      .get("/api/v1/users?status=PENDING")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const ids = response.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(pendingUser.id);
    expect(ids).not.toContain(admin.id);
  });

  it("should filter by banned via bannedAt", async () => {
    const admin = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildCustomer();

    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "spam" });

    const banned = await request(app)
      .get("/api/v1/users?banned=true")
      .set("Authorization", `Bearer ${token}`);

    expect(banned.status).toBe(200);
    const bannedIds = banned.body.data.map((u: { id: string }) => u.id);
    expect(bannedIds).toContain(target.id);

    const notBanned = await request(app)
      .get("/api/v1/users?banned=false")
      .set("Authorization", `Bearer ${token}`);

    const notBannedIds = notBanned.body.data.map((u: { id: string }) => u.id);
    expect(notBannedIds).not.toContain(target.id);
  });

  it("should filter by role", async () => {
    const admin = await buildEmployee({ roleNames: ["manager"] });
    await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(admin.email, admin.password);

    const response = await request(app)
      .get("/api/v1/users?role=manager")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const ids = response.body.data.map((u: { id: string }) => u.id);
    expect(ids).toContain(admin.id);
  });

  it("should reject an unknown role value with 422", async () => {
    const admin = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(admin.email, admin.password);

    const response = await request(app)
      .get("/api/v1/users?role=does-not-exist")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["role"]);
  });

  it("should reject an unknown status value with 422", async () => {
    const admin = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(admin.email, admin.password);

    const response = await request(app)
      .get("/api/v1/users?status=NOPE")
      .set("Authorization", `Bearer ${token}`);

    expectValidationError(response, ["status"]);
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
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user"',
    });
  });

  it("should return 422 if id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users/invalid-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["id"]);
  });

  it("should return 404 if user with given id does not exist (authorized actor)", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

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

  it("should return 403 (not 404) for a non-existent id when the actor lacks read:user:others — no existence leak", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user:others"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  });

  it("should return 200 and user data if user has feature: `read: user`", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.owner);

    expect(response.body).not.toHaveProperty("passwordHash");

    expect(response.body.id).toBe(user.id);
    expect(response.body.name).toBe(user.name);
    expect(response.body.email).toBe(user.email);
    expect(response.body.cpf).toBe(user.cpf);
  });

  it("should return 200 and user data if user has feature: `read:user:others`", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["read:user"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.admin);

    expect(response.body).not.toHaveProperty("passwordHash");
  });

  it("should return 403 if user tries to access another user's data without `read:user:others` feature", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["read:user:others"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const tokenUser1 = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "read:user:others"',
    });
  });

  it("should return 200 and user data if user has feature: `read:user:others` and isn't the owner", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["read:user"],
    });

    const user2 = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.admin);

    expect(response.body).not.toHaveProperty("passwordHash");
  });
});

describe("PATCH /api/v1/users/:id", () => {
  it("should return 200 and update user data if user has feature: `update: user` and is the owner of the user", async () => {
    const user = await buildEmployee();

    const token = await loginAs(user.email, user.password);

    const newName = faker.person.fullName();

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: newName });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.owner);

    expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(user.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);

    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      user.updatedAt.getTime(),
    );

    expect(updatedUserInDb.email).toBe(user.email);
  });

  it("should return 200 and update user data if user has feature: `update:user:others`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
      denies: ["update:user"],
    });

    const user2 = await buildEmployee();

    const tokenUser1 = await loginAs(user1.email, user1.password);

    const newName = faker.person.fullName();

    const response = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`)
      .send({ name: newName });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.admin);

    expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(user2.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);

    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      user2.updatedAt.getTime(),
    );

    expect(updatedUserInDb.email).toBe(user2.email);
  });

  it("should return 403 if user tries to update another user's data without `update:user:others` feature", async () => {
    const user1 = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["update:user:others"],
    });

    const user2 = await buildEmployee();

    const tokenUser1 = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${tokenUser1}`)
      .send({ name: "New Name" });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user:others"',
    });
  });

  it("should return 403 if user tries to update a non-existent user's data with `update:user` feature", async () => {
    const user1 = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["update:user:others"],
    });

    const tokenUser1 = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .patch(`/api/v1/users/${faker.string.uuid()}`)
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
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["update:user"],
    });

    const token = await loginAs(user.email, user.password);

    const newName = faker.person.fullName();

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: newName });

    expect(response.status).toBe(200);

    const updatedUserInDb = await findUserById(user.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);
  });

  it("should return 422 if no fields to update are provided", async () => {
    const user = await buildEmployee();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);

    expectValidationError(response);
  });

  it("should return 422 if id is not a valid uuid", async () => {
    const user = await buildEmployee();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/invalid-id`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: faker.person.fullName() });

    expect(response.status).toBe(422);

    expectValidationError(response, ["id"]);
  });

  it("should return 401 if no auth token is provided", async () => {
    const response = await request(app)
      .patch("/api/v1/users/some-id")
      .send({ name: faker.person.fullName() });

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Usuário não autenticado",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `update:user`", async () => {
    const user = await buildEmployee({
      denies: ["update:user", "update:user:others"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: faker.person.fullName() });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "update:user"',
    });
  });

  it("should return 422 and denies update any forbidden fields by this endpoint even if they have `update:user` feature", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewPassword123!" });

    expect(response.status).toBe(422);

    expectValidationError(response, ["password"]);

    const response2 = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "newemail@example.com" });

    expect(response2.status).toBe(422);

    expectValidationError(response2, ["email"]);

    const response3 = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cpf: "147987526-89" });

    expect(response3.status).toBe(422);

    expectValidationError(response3, ["cpf"]);

    const response4 = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["manager"] });

    expect(response4.status).toBe(422);

    expectValidationError(response4, ["roleNames"]);
  });

  it("should return 422 and denies update any forbidden fields by this endpoint even if they have `update:user:others` feature", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["update:user"],
    });

    const user2 = await buildEmployee();

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ password: "NewPassword123!" });

    expect(response.status).toBe(422);

    expectValidationError(response, ["password"]);

    const response2 = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "newemail@example.com" });

    expect(response2.status).toBe(422);

    expectValidationError(response2, ["email"]);

    const response3 = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cpf: "147987526-89" });

    expect(response3.status).toBe(422);

    expectValidationError(response3, ["cpf"]);

    const response4 = await request(app)
      .patch(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["manager"] });

    expect(response4.status).toBe(422);

    expectValidationError(response4, ["roleNames"]);
  });

  it("should return 422 if user tries to update invalid fields with valid fiels in the same body", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: faker.person.fullName(),
        password: "NewPassword123!",
        email: faker.internet.email(),
        cpf: "147987526-89",
        roleNames: ["manager"],
      });

    expect(response.status).toBe(422);

    expectValidationError(response, ["password", "email", "cpf", "roleNames"]);

    const updatedUserInDb = await findUserById(user.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(user.name);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .patch(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: faker.person.fullName() });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and update all permited properties of the user correctly", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });

    const token = await loginAs(user.email, user.password);

    const newName = faker.person.fullName();

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: newName,
      });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userViews.owner);

    expect(response.body).not.toHaveProperty("passwordHash");

    const updatedUserInDb = await findUserById(user.id);

    assert(updatedUserInDb !== null, "User should be found in the database");

    expect(updatedUserInDb.name).toBe(newName);

    expect(updatedUserInDb.updatedAt.getTime()).toBeGreaterThan(
      user.updatedAt.getTime(),
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
    const user = await buildEmployee({ denies: ["delete:user"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user"',
    });
  });

  it("should return 403 if user tries to delete a non-existent user's data with `delete:user` feature", async () => {
    const user1 = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["delete:user:others"],
    });

    const tokenUser1 = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${tokenUser1}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  });

  it("should return 422 if id is not a valid uuid", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete("/api/v1/users/invalid-id")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["id"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user.email, user.password);

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
    const user1 = await buildEmployee({
      roleNames: ["manager"],
      denies: ["delete:user:others"],
    });
    const user2 = await buildEmployee({ roleNames: ["manager"] });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      action: 'Verifique se você tem acesso a feature "delete:user:others"',
    });
  });

  it("should return 204 and delete the user if user has feature: `delete:user` and is the owner of the user", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["delete:user:others"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    let deletedUserInDb = await findUserById(user.id);

    expect(deletedUserInDb).toBeNull();

    deletedUserInDb = await findDeletedUserById(user.id);

    expect(deletedUserInDb?.deletedAt).not.toBeNull();
  });

  it("should return 204 and delete the user if user has feature: `delete:user:others`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    let deletedUserInDb = await findUserById(user2.id);

    expect(deletedUserInDb).toBeNull();

    deletedUserInDb = await findDeletedUserById(user2.id);

    expect(deletedUserInDb?.deletedAt).not.toBeNull();
  });

  it("should return 204 if user with delete:user:others deletes their own account", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    let deletedUserInDb = await findUserById(user.id);

    expect(deletedUserInDb).toBeNull();

    deletedUserInDb = await findDeletedUserById(user.id);

    expect(deletedUserInDb?.deletedAt).not.toBeNull();
  });

  it("should invalidate the session after user deletion", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    await request(app)
      .delete(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(401);
  });

  it("should return 204 and soft delete the target user, preserving the history of the user in the database", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    let deletedUserInDb = await findUserById(user2.id);

    expect(deletedUserInDb).toBeNull();

    deletedUserInDb = await findDeletedUserById(user2.id);

    expect(deletedUserInDb?.deletedAt).not.toBeNull();
    expect(deletedUserInDb?.employee).not.toBeNull();
  });

  it("should return 404 if user tries to delete a user that has already been deleted", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    await request(app)
      .delete(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });
});

describe("POST /api/v1/users/:id/ban", () => {
  it("should return 401 without an access token", async () => {
    const target = await buildCustomer();

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(401);
  });

  it("should return 403 without the manage:user:status feature", async () => {
    const actor = await buildEmployee({ roleNames: ["attendant"] });
    const target = await buildCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(403);
  });

  it("should return 422 for an invalid :id", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post("/api/v1/users/not-a-uuid/ban")
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(422);
  });

  it("should return 422 when reason is missing", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(422);
    expectValidationError(response, ["reason"]);
  });

  it("should return 404 for a non-existent target", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${faker.string.uuid()}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(404);
  });

  it("should return 403 when a non-admin bans a privileged target", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(403);

    const targetInDb = await findUserById(target.id);
    expect(targetInDb?.bannedAt).toBeNull();
  });

  it("should return 409 when the actor tries to ban itself", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${actor.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(409);

    const actorInDb = await findUserById(actor.id);
    expect(actorInDb?.bannedAt).toBeNull();
  });

  it("should return 409 when the target is already banned", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), banReason: "prior" },
    });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "abuse" });

    expect(response.status).toBe(409);
  });

  it("should ban the target, set the audit columns and invalidate its sessions", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    const { refreshCookie } = await loginWithSession(
      target.email,
      target.password,
    );
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "spam" });

    expect(response.status).toBe(204);

    const targetInDb = await findUserById(target.id);
    expect(targetInDb?.bannedAt).not.toBeNull();
    expect(targetInDb?.bannedBy).toBe(actor.id);
    expect(targetInDb?.banReason).toBe("spam");

    // sessions dropped
    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie);
    expect(refreshResponse.status).toBe(401);

    // banned account cannot log in
    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: target.email,
      password: target.password,
    });
    expect(loginResponse.status).toBe(403);
  });
});

describe("DELETE /api/v1/users/:id/ban", () => {
  async function bannedCustomer() {
    const target = await buildCustomer();
    await prisma.user.update({
      where: { id: target.id },
      data: {
        bannedAt: new Date(),
        bannedBy: faker.string.uuid(),
        banReason: "x",
      },
    });
    return target;
  }

  it("should return 401 without an access token", async () => {
    const target = await bannedCustomer();

    const response = await request(app).delete(
      `/api/v1/users/${target.id}/ban`,
    );

    expect(response.status).toBe(401);
  });

  it("should return 403 without the manage:user:status feature", async () => {
    const actor = await buildEmployee({ roleNames: ["attendant"] });
    const target = await bannedCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 422 for an invalid :id", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete("/api/v1/users/not-a-uuid/ban")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
  });

  it("should return 404 for a non-existent target", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 403 when a non-admin unbans a privileged target", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["admin"] });
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), banReason: "x" },
    });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 409 when the actor tries to unban itself", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${actor.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it("should return 409 when the target is not banned", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it("should unban the target, clear the audit columns and preserve status", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), bannedBy: actor.id, banReason: "x" },
    });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const targetInDb = await findUserById(target.id);
    expect(targetInDb?.bannedAt).toBeNull();
    expect(targetInDb?.bannedBy).toBeNull();
    expect(targetInDb?.banReason).toBeNull();
    expect(targetInDb?.status).toBe("ACTIVE");

    // can log in again
    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: target.email,
      password: target.password,
    });
    expect(loginResponse.status).toBe(200);
  });
});

describe("DELETE /api/v1/users/:id/lock", () => {
  async function lockedCustomer() {
    const target = await buildCustomer();

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: target.email,
        password: "wrongpassword",
      });
    }

    return target;
  }

  it("should return 401 without an access token", async () => {
    const target = await lockedCustomer();

    const response = await request(app).delete(
      `/api/v1/users/${target.id}/lock`,
    );

    expect(response.status).toBe(401);
  });

  it("should return 403 without the manage:user:status feature", async () => {
    const actor = await buildEmployee({ roleNames: ["attendant"] });
    const target = await lockedCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 422 for an invalid :id", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete("/api/v1/users/not-a-uuid/lock")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
  });

  it("should return 404 for a non-existent target", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });

  it("should return 403 when a non-admin unlocks a privileged target", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["admin"] });

    for (let i = 0; i < env.LOCKOUT_THRESHOLD; i++) {
      await request(app).post("/api/v1/auth/login").send({
        email: target.email,
        password: "wrongpassword",
      });
    }

    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it("should return 409 when the actor tries to unlock itself", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${actor.id}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it("should return 409 when the target is not locked", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
  });

  it("should unlock the target and record AUTH_LOCKOUT_CLEARED", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await lockedCustomer();
    const token = await loginAs(actor.email, actor.password);

    // confirms the target really is locked before unlocking it
    const lockedLogin = await request(app).post("/api/v1/auth/login").send({
      email: target.email,
      password: target.password,
    });
    expect(lockedLogin.status).toBe(429);

    const response = await request(app)
      .delete(`/api/v1/users/${target.id}/lock`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email: target.email,
      password: target.password,
    });
    expect(loginResponse.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: "AUTH_LOCKOUT_CLEARED", targetId: target.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toEqual({ clearedBy: "ADMIN" });
  });
});
