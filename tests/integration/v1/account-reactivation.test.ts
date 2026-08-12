import {
  attachOverrides,
  buildCustomer,
  buildEmployee,
  buildHybrid,
  makeCustomerData,
} from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { makePassword } from "@tests/helpers/primitives";
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
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import type { RoleName } from "@/modules/role/role.constants";
import { softDeleteUserAndInvalidateSessions } from "@/modules/user/user.repository";

// A reativação atravessa dois routers (o signup em `/auth`, a ação do admin em
// `/users`) e converge numa confirmação pública só — por isso mora num arquivo
// nomeado pelo fluxo, não pelo router, no precedente de `user.profile.test.ts`.

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

/** Extracts the raw token from the `?token=` link in the last sent email. */
function tokenFromLastEmail(): string {
  const call = sendMock.mock.calls.at(-1)?.[0] as { html: string } | undefined;
  const match = call?.html.match(/token=([a-f0-9]+)/);
  if (!match?.[1]) {
    throw new Error("reactivation token not found in the sent email");
  }
  return match[1];
}

const signupReclaiming = (target: { email: string; cpf: string }) =>
  request(app)
    .post("/api/v1/auth/signup")
    .send({ ...makeCustomerData(), email: target.email, cpf: target.cpf });

const confirm = (body: Record<string, unknown>) =>
  request(app).post("/api/v1/auth/confirm-account-reactivation").send(body);

const reactivationTokens = (userId: string) =>
  prisma.verificationToken.findMany({
    where: { userId, purpose: "ACCOUNT_REACTIVATION" },
  });

const activeRoleNames = async (userId: string) =>
  (
    await prisma.userRole.findMany({
      where: { userId, deletedAt: null },
      include: { role: true },
    })
  ).map((userRole) => userRole.role.name);

const activeOverrideNames = async (userId: string) =>
  (
    await prisma.userFeature.findMany({
      where: { deletedAt: null, userRole: { userId } },
      include: { feature: true },
    })
  ).map((override) => override.feature.name);

describe("POST /api/v1/auth/signup — conta soft-deletada", () => {
  it("should return 202 and issue a reactivation token when the cpf matches", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    const response = await signupReclaiming(target);

    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty("message");
    // A resposta não confirma que a conta existe: é a mesma frase condicional
    // do `/forgot-password`.
    expect(response.body).not.toHaveProperty("id");

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: target.email }),
    );

    const tokens = await reactivationTokens(target.id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.restoreProfiles).toEqual(["CUSTOMER"]);
    // Vazio = default do D8: todas as roles que morreram na cascata.
    expect(tokens[0]?.restoreRoleIds).toEqual([]);

    // O pedido não muda nada na conta — quem reativa é a confirmação.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.deletedAt).not.toBeNull();
  });

  it("should return a generic 409 when the cpf does not match, without hinting the account exists", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({ ...makeCustomerData(), email: target.email });

    expect(response.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should return the same generic 409 for a banned account, revealing nothing (K24)", async () => {
    const target = await buildCustomer();
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), banReason: "fraude" },
    });
    await softDeleteUserAndInvalidateSessions(target.id);

    const response = await signupReclaiming(target);

    expect(response.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should never touch a live account, even when email and cpf both match (D12)", async () => {
    const target = await buildEmployee();

    const response = await signupReclaiming(target);

    expect(response.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
    expect(
      await prisma.customer.findUnique({ where: { userId: target.id } }),
    ).toBeNull();
  });

  it("should invalidate the previous pending token when signup is retried", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    const firstToken = tokenFromLastEmail();

    await signupReclaiming(target);

    const tokens = await reactivationTokens(target.id);
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((token) => token.usedAt === null)).toHaveLength(1);

    const response = await confirm({
      token: firstToken,
      newPassword: makePassword(),
    });
    expect(response.status).toBe(400);
  });
});

describe("POST /api/v1/auth/confirm-account-reactivation", () => {
  it("should bring back the account and the customer profile (Caso A)", async () => {
    const target = await buildCustomer();
    await attachOverrides(target.id, { grants: ["read:log"] });
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    const newPassword = makePassword();

    const response = await confirm({
      token: tokenFromLastEmail(),
      newPassword,
    });

    expect(response.status).toBe(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.deletedAt).toBeNull();
    // Consumir o token é a prova de posse do email que o `verify-email` exige.
    expect(user.status).toBe("ACTIVE");
    expect(user.mustChangePassword).toBe(false);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    expect(customer.deletedAt).toBeNull();

    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
    // A role volta; o override pendurado nela, não (D6'/K16).
    expect(await activeOverrideNames(target.id)).toEqual([]);

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: newPassword });
    expect(login.status).toBe(200);

    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: target.email, password: target.password });
    expect(oldLogin.status).toBe(401);
  });

  it("should create a customer profile from scratch when the account never had one (Caso B)", async () => {
    const target = await buildEmployee();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    const token = tokenFromLastEmail();

    const missingPhone = await confirm({
      token,
      newPassword: makePassword(),
    });

    expectValidationError(missingPhone, ["phone"]);

    const response = await confirm({
      token,
      newPassword: makePassword(),
      phone: "11987650001",
    });

    expect(response.status).toBe(204);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    expect(customer.deletedAt).toBeNull();
    expect(customer.phone).toBe("11987650001");

    // O perfil de funcionário continua morto: self-service nunca o traz (D11).
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { userId: target.id },
    });
    expect(employee.deletedAt).not.toBeNull();

    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
  });

  it("should restore the customer profile and leave the employee one dead (Caso C, D11)", async () => {
    const target = await buildHybrid({ employeeRoles: ["manager"] });
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);

    const response = await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(response.status).toBe(204);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { userId: target.id },
    });

    expect(customer.deletedAt).toBeNull();
    expect(employee.deletedAt).not.toBeNull();
    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
  });

  it("should leave behind a role revoked in an earlier cycle", async () => {
    const target = await buildCustomer();

    // A role morre sozinha, num instante que não é o da conta.
    await prisma.userRole.updateMany({
      where: { userId: target.id, role: { name: "customer" } },
      data: { deletedAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);

    const response = await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(response.status).toBe(204);

    // O perfil volta (K20), mas a role que morreu noutro instante não bate.
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    expect(customer.deletedAt).toBeNull();
    expect(await activeRoleNames(target.id)).toEqual([]);
  });

  it("should refuse an unknown, used, expired or wrong-purpose token with a generic 400", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    const unknown = await confirm({
      token: generateOpaqueToken(),
      newPassword: makePassword(),
    });
    expect(unknown.status).toBe(400);

    const seed = async (overrides: {
      purpose?: "ACCOUNT_REACTIVATION" | "PASSWORD_RESET";
      expiresAt?: Date;
      usedAt?: Date | null;
    }) => {
      const rawToken = generateOpaqueToken();
      await prisma.verificationToken.create({
        data: {
          userId: target.id,
          tokenHash: hashToken(rawToken),
          purpose: overrides.purpose ?? "ACCOUNT_REACTIVATION",
          expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000),
          usedAt: overrides.usedAt ?? null,
          restoreProfiles: ["CUSTOMER"],
        },
      });
      return rawToken;
    };

    const used = await confirm({
      token: await seed({ usedAt: new Date() }),
      newPassword: makePassword(),
    });
    expect(used.status).toBe(400);

    const expired = await confirm({
      token: await seed({ expiresAt: new Date(Date.now() - 1000) }),
      newPassword: makePassword(),
    });
    expect(expired.status).toBe(400);

    const wrongPurpose = await confirm({
      token: await seed({ purpose: "PASSWORD_RESET" }),
      newPassword: makePassword(),
    });
    expect(wrongPurpose.status).toBe(400);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.deletedAt).not.toBeNull();
  });

  it("should refuse to reactivate an account already alive, with a generic 400", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    const token = tokenFromLastEmail();

    expect((await confirm({ token, newPassword: makePassword() })).status).toBe(
      204,
    );

    const replay = await confirm({ token, newPassword: makePassword() });
    expect(replay.status).toBe(400);
  });

  it("should refuse a banned account with 403 (K24)", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    const token = tokenFromLastEmail();

    // O ban só é alcançável entre a emissão e a confirmação — os dois caminhos
    // de pedido já recusam conta banida. A checagem é a última linha de defesa.
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), banReason: "fraude" },
    });

    const response = await confirm({ token, newPassword: makePassword() });

    expect(response.status).toBe(403);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.deletedAt).not.toBeNull();
  });

  it("should reject a weak password with 422", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);

    const response = await confirm({
      token: tokenFromLastEmail(),
      newPassword: "123",
    });

    expectValidationError(response, ["newPassword"]);
  });

  it("should record the audit trail of both halves, without PII", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    await signupReclaiming(target);
    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    const requested = await prisma.auditLog.findFirstOrThrow({
      where: { action: "ACCOUNT_REACTIVATION_REQUESTED", targetId: target.id },
    });
    expect(requested.metadata).toMatchObject({
      source: "SELF",
      profiles: ["CUSTOMER"],
    });

    const completed = await prisma.auditLog.findFirstOrThrow({
      where: { action: "ACCOUNT_REACTIVATION_COMPLETED", targetId: target.id },
    });
    expect(completed.metadata).toMatchObject({
      profilesRestored: ["CUSTOMER"],
      profilesCreated: [],
      restoredRoles: 1,
      grantedRoles: 0,
    });

    const serialized = JSON.stringify([requested, completed]);
    expect(serialized).not.toContain(target.email);
    expect(serialized).not.toContain(target.cpf);
  });

  it("should never bring an override back, whatever killed it (D6')", async () => {
    const target = await buildCustomer();
    await attachOverrides(target.id, {
      grants: ["read:log"],
      denies: ["update:user"],
    });

    const killedOnPurpose = await prisma.userFeature.findFirstOrThrow({
      where: { feature: { name: "read:log" }, userRole: { userId: target.id } },
    });
    await prisma.userFeature.update({
      where: { id: killedOnPurpose.id },
      data: { deletedAt: new Date("2020-01-01T00:00:00.000Z") },
    });

    await softDeleteUserAndInvalidateSessions(target.id);
    await signupReclaiming(target);
    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
    expect(await activeOverrideNames(target.id)).toEqual([]);

    // As linhas continuam soft-deletadas: evidência para o audit.
    const rows = await prisma.userFeature.findMany({
      where: { userRole: { userId: target.id } },
    });
    assert(rows.length === 2, "os dois overrides deveriam continuar existindo");
    expect(rows.every((row) => row.deletedAt !== null)).toBe(true);
  });
});

describe("POST /api/v1/users/:id/reactivate", () => {
  const reactivate = (
    token: string,
    userId: string,
    body: Record<string, unknown>,
  ) =>
    request(app)
      .post(`/api/v1/users/${userId}/reactivate`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const deletedHybrid = async (employeeRoles: RoleName[] = ["attendant"]) => {
    const target = await buildHybrid({ employeeRoles });
    await softDeleteUserAndInvalidateSessions(target.id);
    return target;
  };

  it("should require authentication and the reactivate:user feature", async () => {
    const target = await deletedHybrid();

    const anonymous = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .send({ profiles: ["CUSTOMER"] });
    expect(anonymous.status).toBe(401);

    const attendant = await buildEmployee({ roleNames: ["attendant"] });
    const attendantToken = await loginAs(attendant.email, attendant.password);

    const forbidden = await reactivate(attendantToken, target.id, {
      profiles: ["CUSTOMER"],
    });
    expect(forbidden.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should issue the token for the profiles the manager chose", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
    });

    expect(response.status).toBe(204);

    const tokens = await reactivationTokens(target.id);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.restoreProfiles).toEqual(["EMPLOYEE"]);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: target.email }),
    );

    // O pedido não reativa nada: quem reativa é o dono, com o token.
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });
    expect(user.deletedAt).not.toBeNull();
  });

  it("should bring back both profiles when both are claimed", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    await reactivate(token, target.id, {
      profiles: ["CUSTOMER", "EMPLOYEE"],
    });

    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { userId: target.id },
    });

    expect(customer.deletedAt).toBeNull();
    expect(employee.deletedAt).toBeNull();
    expect(await activeRoleNames(target.id)).toEqual(
      expect.arrayContaining(["customer", "attendant"]),
    );
  });

  it("should narrow the roles the profile comes back with (D8)", async () => {
    const target = await buildHybrid({
      employeeRoles: ["attendant", "manager"],
    });
    await softDeleteUserAndInvalidateSessions(target.id);

    const admin = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(admin.email, admin.password);

    await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
      roleNames: ["attendant"],
    });

    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(await activeRoleNames(target.id)).toEqual(["attendant"]);
  });

  it("should grant a named role that did not die in the cascade (K15/K21)", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    // `manager` nunca foi atribuída: nomeá-la é conceder, não restaurar.
    await softDeleteUserAndInvalidateSessions(target.id);

    const admin = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(admin.email, admin.password);

    await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
      roleNames: ["attendant", "manager"],
    });

    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(await activeRoleNames(target.id)).toEqual(
      expect.arrayContaining(["attendant", "manager"]),
    );
  });

  it("should create the customer profile from scratch for an employee-only account (Caso B)", async () => {
    const target = await buildEmployee();
    await softDeleteUserAndInvalidateSessions(target.id);

    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["CUSTOMER"],
    });
    expect(response.status).toBe(204);

    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
      phone: "11987650002",
    });

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { userId: target.id },
    });
    expect(customer.deletedAt).toBeNull();
    expect(await activeRoleNames(target.id)).toEqual(["customer"]);
  });

  it("should refuse to invent an employee profile that never existed (§5.2)", async () => {
    const target = await buildCustomer();
    await softDeleteUserAndInvalidateSessions(target.id);

    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
    });

    expectValidationError(response, ["profiles"]);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should refuse an empty profile list (D14)", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, { profiles: [] });

    expectValidationError(response, ["profiles"]);
  });

  it("should refuse a role incompatible with the claimed profiles", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["CUSTOMER"],
      roleNames: ["attendant"],
    });

    expectValidationError(response);
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should 404 an account that is not deleted", async () => {
    const target = await buildCustomer();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["CUSTOMER"],
    });

    expect(response.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("should 409 a banned account (K24)", async () => {
    const target = await buildCustomer();
    await prisma.user.update({
      where: { id: target.id },
      data: { bannedAt: new Date(), banReason: "fraude" },
    });
    await softDeleteUserAndInvalidateSessions(target.id);

    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["CUSTOMER"],
    });

    expect(response.status).toBe(409);
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should refuse a manager reactivating an account that carried a privileged role (K22)", async () => {
    const target = await deletedHybrid(["admin"]);
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
    });

    expect(response.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should refuse a manager naming a privileged role (K22)", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
      roleNames: ["admin"],
    });

    expect(response.status).toBe(403);
    expect(await reactivationTokens(target.id)).toHaveLength(0);
  });

  it("should let an admin reactivate an account that carried a privileged role", async () => {
    const target = await deletedHybrid(["admin"]);
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const token = await loginAs(admin.email, admin.password);

    const response = await reactivate(token, target.id, {
      profiles: ["EMPLOYEE"],
    });

    expect(response.status).toBe(204);

    await confirm({
      token: tokenFromLastEmail(),
      newPassword: makePassword(),
    });

    expect(await activeRoleNames(target.id)).toEqual(["admin"]);
  });

  it("should record the request in the audit trail as an admin-sourced one", async () => {
    const target = await deletedHybrid();
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    await reactivate(token, target.id, { profiles: ["EMPLOYEE"] });

    const requested = await prisma.auditLog.findFirstOrThrow({
      where: { action: "ACCOUNT_REACTIVATION_REQUESTED", targetId: target.id },
    });

    expect(requested.actorId).toBe(manager.id);
    expect(requested.metadata).toMatchObject({
      source: "ADMIN",
      profiles: ["EMPLOYEE"],
    });
    expect(JSON.stringify(requested)).not.toContain(target.email);
  });
});
