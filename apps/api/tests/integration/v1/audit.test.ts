import {
  attachOverrides,
  buildCustomer,
  buildEmployee,
  buildHybrid,
} from "@tests/factories/user.factory";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { issueVerificationToken } from "@/modules/auth/verificationToken.service";
import { getFeatureByName } from "@/modules/feature/feature.repository";
import { getRoleByName } from "@/modules/role/role.repository";

// Sem mailpit no test, o envio real daria 503; o mock deixa criação/verificação
// chegarem ao ponto de audit (padrão de auth.test / logging.test).
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ send: sendMock }));

function auditRows(action: string) {
  return prisma.auditLog.findMany({ where: { action } });
}

describe("Audit log", () => {
  beforeEach(async () => {
    sendMock.mockReset();
    sendMock.mockResolvedValue(undefined);
    await clearDatabase();
    await flushRedis();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Criação ───────────────────────────────────────────────────────────────

  it("records USER_CREATED (source SIGNUP, no actor) on signup", async () => {
    const email = "novo@example.com";
    await request(app).post("/api/v1/auth/signup").send({
      name: "Novo Cliente",
      email,
      cpf: "39053344705",
      phone: "11987654321",
      password: "SenhaForte123!",
    });

    const rows = await auditRows("USER_CREATED");
    const created = await prisma.user.findUnique({ where: { email } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      targetType: "User",
      targetId: created?.id,
      actorId: null,
      metadata: { source: "SIGNUP" },
    });
  });

  it("records USER_CREATED (source ADMIN, actor set) on POST /users", async () => {
    const admin = await buildEmployee({ grants: ["create:user"] });
    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Func Novo",
        email: "func@example.com",
        cpf: "39053344705",
        password: "SenhaForte123!",
      });

    const created = await prisma.user.findUnique({
      where: { email: "func@example.com" },
    });

    // `buildEmployee` também audita a criação do admin (docs/adr/0205) — o que
    // se verifica aqui é a linha do endpoint, achada pelo alvo.
    const row = (await auditRows("USER_CREATED")).find(
      (r) => r.targetId === created?.id,
    );

    expect(row).toMatchObject({
      actorId: admin.id,
      metadata: { source: "ADMIN" },
    });
  });

  // ─── Delete / ban / unban ────────────────────────────────────────────────────

  it("records USER_DELETED with actor and target", async () => {
    const admin = await buildEmployee({ grants: ["delete:user:others"] });
    const target = await buildCustomer();
    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(await auditRows("USER_DELETED")).toEqual([
      expect.objectContaining({ actorId: admin.id, targetId: target.id }),
    ]);
  });

  it("records the cascade counts on USER_DELETED (K8)", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    await attachOverrides(target.id, {
      grants: ["read:log"],
      overrideRole: "attendant",
    });

    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${token}`);

    const rows = await auditRows("USER_DELETED");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.metadata).toMatchObject({
      cascadedProfiles: 2,
      cascadedRoles: 2,
      cascadedOverrides: 1,
    });
  });

  it("records USER_PROFILE_DELETED with the profile kind and the cascade counts (K8)", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    await attachOverrides(target.id, {
      grants: ["read:log"],
      overrideRole: "attendant",
    });

    const token = await loginAs(manager.email, manager.password);

    await request(app)
      .delete(`/api/v1/users/${target.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    const rows = await auditRows("USER_PROFILE_DELETED");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: manager.id,
      targetType: "User",
      targetId: target.id,
      metadata: {
        profileKind: "EMPLOYEE",
        cascadedRoles: 1,
        cascadedOverrides: 1,
      },
    });

    // Contrato de PII: nem o email nem o nome do alvo entram na linha.
    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain(target.email);
    expect(dump).not.toContain(target.name);
  });

  it("records USER_PROFILE_CREATED with the profile kind and the role count", async () => {
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildCustomer();

    const token = await loginAs(manager.email, manager.password);

    await request(app)
      .post(`/api/v1/users/${target.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleNames: ["attendant"] });

    const rows = await auditRows("USER_PROFILE_CREATED");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: manager.id,
      targetType: "User",
      targetId: target.id,
      metadata: { profileKind: "EMPLOYEE", roles: 1 },
    });

    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain(target.email);
    expect(dump).not.toContain(target.name);
  });

  it("records USER_PROFILE_RESTORED separating restored from granted roles", async () => {
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildHybrid({ employeeRoles: ["attendant"] });

    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .delete(`/api/v1/users/${target.id}/employee`)
      .set("Authorization", `Bearer ${token}`);

    await request(app)
      .post(`/api/v1/users/${target.id}/employee`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    const rows = await auditRows("USER_PROFILE_RESTORED");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.id,
      targetType: "User",
      targetId: target.id,
      // Restaurada ≠ concedida: sem `roleNames`, tudo veio por correlação de
      // data e nada foi decisão nova do ator.
      metadata: { profileKind: "EMPLOYEE", restoredRoles: 1, grantedRoles: 0 },
    });

    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain(target.email);
    expect(dump).not.toContain(target.name);
  });

  it("records USER_BANNED with reasonProvided and no PII", async () => {
    const admin = await buildEmployee({ grants: ["manage:user:status"] });
    const target = await buildCustomer();
    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Fraude confirmada pelo financeiro" });

    const rows = await auditRows("USER_BANNED");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.id,
      targetId: target.id,
      metadata: { reasonProvided: true },
    });
    // Contrato de PII: o texto do motivo e o email do alvo não vazam.
    const dump = JSON.stringify(rows[0]);
    expect(dump).not.toContain("Fraude confirmada");
    expect(dump).not.toContain(target.email);
  });

  it("records USER_UNBANNED", async () => {
    const admin = await buildEmployee({ grants: ["manage:user:status"] });
    const target = await buildCustomer();
    const token = await loginAs(admin.email, admin.password);

    await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "motivo qualquer" });
    await request(app)
      .delete(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`);

    expect(await auditRows("USER_UNBANNED")).toEqual([
      expect.objectContaining({ actorId: admin.id, targetId: target.id }),
    ]);
  });

  // ─── Roles / permissions ─────────────────────────────────────────────────────

  it("records USER_ROLE_GRANTED and USER_ROLE_REVOKED", async () => {
    // Role admin: manager é papel privilegiado, cujo grant exige ator admin.
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(admin.email, admin.password);
    const managerRole = await getRoleByName("manager");

    await request(app)
      .post(`/api/v1/users/${target.id}/roles/${managerRole?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(await auditRows("USER_ROLE_GRANTED")).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        targetId: target.id,
        metadata: { roleId: managerRole?.id, roleName: "manager" },
      }),
    ]);

    await request(app)
      .delete(`/api/v1/users/${target.id}/roles/${managerRole?.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(await auditRows("USER_ROLE_REVOKED")).toEqual([
      expect.objectContaining({
        targetId: target.id,
        metadata: {
          roleId: managerRole?.id,
          roleName: "manager",
          cascadedOverrides: 0,
        },
      }),
    ]);
  });

  it("records USER_PERMISSION_GRANTED and USER_PERMISSION_REVOKED", async () => {
    // read:role é feature de permissão: override dela exige ator admin.
    const admin = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildEmployee();
    const token = await loginAs(admin.email, admin.password);
    const feature = await getFeatureByName("read:role");
    // O override pendura na atribuição de role (D2), então a role vai no path.
    const attendantRole = await getRoleByName("attendant");

    const url = `/api/v1/users/${target.id}/roles/${attendantRole?.id}/features/${feature?.id}`;

    await request(app)
      .put(url)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(await auditRows("USER_PERMISSION_GRANTED")).toEqual([
      expect.objectContaining({
        actorId: admin.id,
        targetId: target.id,
        metadata: {
          featureName: "read:role",
          roleId: attendantRole?.id,
          roleName: "attendant",
          effect: "GRANT",
        },
      }),
    ]);

    await request(app).delete(url).set("Authorization", `Bearer ${token}`);

    expect(await auditRows("USER_PERMISSION_REVOKED")).toEqual([
      expect.objectContaining({
        targetId: target.id,
        metadata: { featureName: "read:role", roleId: attendantRole?.id },
      }),
    ]);
  });

  // ─── Senha ──────────────────────────────────────────────────────────────────

  it("records PASSWORD_RESET_REQUESTED on forgot-password", async () => {
    const user = await buildCustomer();

    await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: user.email });

    expect(await auditRows("PASSWORD_RESET_REQUESTED")).toEqual([
      expect.objectContaining({ targetId: user.id }),
    ]);
  });

  it("records PASSWORD_RESET_COMPLETED on reset-password", async () => {
    const user = await buildCustomer();
    const rawToken = await issueVerificationToken({
      userId: user.id,
      purpose: "PASSWORD_RESET",
    });

    await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: rawToken, newPassword: "OutraSenha123!" });

    expect(await auditRows("PASSWORD_RESET_COMPLETED")).toEqual([
      expect.objectContaining({ targetId: user.id }),
    ]);
  });

  it("records PASSWORD_CHANGED on change-password", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: user.password, newPassword: "NovaSenha123!" });

    expect(await auditRows("PASSWORD_CHANGED")).toEqual([
      expect.objectContaining({ actorId: user.id, targetId: user.id }),
    ]);
  });

  // ─── Login falho ─────────────────────────────────────────────────────────────

  it("records AUTH_LOGIN_FAILED with the owner id on a wrong password", async () => {
    const user = await buildCustomer();

    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "SenhaErrada1!" });

    expect(await auditRows("AUTH_LOGIN_FAILED")).toEqual([
      expect.objectContaining({
        actorId: null,
        targetId: user.id,
        metadata: { reason: "BAD_CREDENTIALS" },
      }),
    ]);
  });

  it("records AUTH_LOGIN_FAILED with no actor and no target on an unknown email", async () => {
    await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "ninguem@example.com", password: "Qualquer123!" });

    expect(await auditRows("AUTH_LOGIN_FAILED")).toEqual([
      expect.objectContaining({ actorId: null, targetId: null }),
    ]);
  });

  // ─── Consistência transacional (§4.5) ────────────────────────────────────────

  // A semântica "audit falha → mutação desfaz" mora num lugar só desde o
  // ADR-0205: tests/unit/lib/auditLog.test.ts (`writeAudited`). Não dá para
  // provar de novo aqui por spy — `writeAudited` chama `record` como binding
  // local do mesmo arquivo, e nenhum mock de fora do módulo alcança essa
  // chamada.
});
