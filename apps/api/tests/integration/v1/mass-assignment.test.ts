import { faker } from "@faker-js/faker";
import { buildPet } from "@tests/factories/pet.factory";
import {
  buildCatalogTaxonomy,
  buildProduct,
} from "@tests/factories/product.factory";
import {
  buildCustomer,
  buildEmployee,
  buildHybrid,
  makeCustomerData,
  makeEmployeeData,
} from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
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
import app from "@/app";
import { prisma } from "@/lib/prisma";
import { getFeatureByName } from "@/modules/feature/feature.repository";
import { getRoleByName } from "@/modules/role/role.repository";
import { softDeleteUserAndInvalidateSessions } from "@/modules/user/user.repository";

/**
 * Regressão explícita de mass assignment (10.12).
 *
 * Nenhum corpo de requisição pode escrever o que só o sistema escreve: estado
 * da conta, vínculo de papel, marca de banimento, marca de senha forçada, hash
 * de senha, `deletedAt`, dono de um recurso. Hoje isso é garantido pelo
 * `.strict()` dos schemas de update (chave desconhecida → 422) e pelo modo
 * *strip* dos demais (chave desconhecida → descartada). Os dois são fáceis de
 * perder em silêncio num refactor — trocar um `.strict()` por `.extend()` na
 * ordem errada, ou montar o `data` do Prisma a partir do `req.body` em vez do
 * corpo parseado — e ninguém percebe até virar incidente. Este arquivo existe
 * para que esse refactor fique vermelho.
 *
 * Cada caso prova as duas metades: a chave privilegiada é **nomeada** na
 * recusa (ou descartada, nos schemas strip) e a coluna no banco **não mudou**
 * — ou foi escrita com o valor do sistema, nunca com o do corpo. Todo schema
 * de escrita novo ganha um caso aqui no mesmo commit em que nasce.
 */

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

/**
 * Um schema `.strict()` reporta a chave desconhecida em `errors.body`
 * (`Unrecognized keys: "a", "b"` — o handler não tem campo para pendurar uma
 * issue `unrecognized_keys` cujo path é só `["body"]`, então cai no prefixo); um
 * campo `z.never` reporta sob o próprio nome. Os dois são "recusada por nome"
 * — o contrato é que a resposta diga qual chave foi rejeitada, não onde o
 * schema a proibiu.
 */
function expectKeysRefused(
  response: { status: number; body: unknown },
  keys: string[],
) {
  expect(response.status).toBe(422);
  expectValidationError(response);

  const { errors } = response.body as { errors: Record<string, string[]> };
  const unrecognized = errors.body ?? [];

  for (const key of keys) {
    const namedAsField = key in errors;
    const namedAsUnrecognized = unrecognized.some((message) =>
      message.includes(`"${key}"`),
    );

    expect(
      namedAsField || namedAsUnrecognized,
      `expected "${key}" to be refused by name, got ${JSON.stringify(errors)}`,
    ).toBe(true);
  }
}

/** Carimbo forjado: distinto de `null`, do default e de "agora" — se vazar, aparece. */
const FORGED_AT = new Date("2020-01-01T00:00:00.000Z");

async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

// ─── Conta: estado, banimento, senha forçada, papel ─────────────────────────

describe("PATCH /api/v1/users/:id", () => {
  it("should refuse status, ban, forced-password, hash, role and deletion marks by name and leave the row untouched", async () => {
    const user = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(user.email, user.password);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: true },
    });

    const response = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        status: "ACTIVE",
        bannedAt: FORGED_AT.toISOString(),
        bannedBy: faker.string.uuid(),
        banReason: "auto-ban",
        mustChangePassword: true,
        passwordHash: "$2b$10$forged",
        deletedAt: FORGED_AT.toISOString(),
        roleNames: ["admin"],
      });

    expectKeysRefused(response, [
      "status",
      "bannedAt",
      "bannedBy",
      "banReason",
      "mustChangePassword",
      "passwordHash",
      "deletedAt",
      "roleNames",
    ]);

    // A requisição inteira é recusada: nem o campo legítimo entra.
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: true },
    });

    expect(after).toEqual(before);
  });
});

describe("POST /api/v1/auth/signup", () => {
  it("should discard status, roleNames, forced-password and deletion marks and create a PENDING customer with the default role only", async () => {
    const data = makeCustomerData();

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        ...data,
        status: "ACTIVE",
        roleNames: ["admin"],
        mustChangePassword: true,
        bannedAt: FORGED_AT.toISOString(),
        deletedAt: FORGED_AT.toISOString(),
      });

    expect(response.status).toBe(201);

    const created = await prisma.user.findUniqueOrThrow({
      where: { email: data.email },
      include: { roles: { include: { role: true } } },
    });

    expect(created).toMatchObject({
      status: "PENDING",
      mustChangePassword: false,
      bannedAt: null,
      deletedAt: null,
    });
    expect(created.roles.map((userRole) => userRole.role.name)).toEqual([
      "customer",
    ]);
  });
});

describe("POST /api/v1/users", () => {
  it("should discard status, forced-password, ban and deletion marks and create a PENDING employee", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(actor.email, actor.password);
    const data = makeEmployeeData();

    const response = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...data,
        status: "ACTIVE",
        mustChangePassword: true,
        bannedAt: FORGED_AT.toISOString(),
        bannedBy: actor.id,
        deletedAt: FORGED_AT.toISOString(),
      });

    expect(response.status).toBe(201);

    const created = await prisma.user.findUniqueOrThrow({
      where: { email: data.email },
    });

    expect(created).toMatchObject({
      status: "PENDING",
      mustChangePassword: false,
      bannedAt: null,
      bannedBy: null,
      deletedAt: null,
    });
  });
});

describe("POST /api/v1/users/:id/ban", () => {
  it("should discard bannedAt and bannedBy from the body and stamp the ban with the system's clock and actor", async () => {
    const actor = await buildEmployee({ roleNames: ["admin"] });
    const target = await buildCustomer();
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/ban`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        reason: "spam",
        bannedAt: FORGED_AT.toISOString(),
        bannedBy: target.id,
        status: "ACTIVE",
        deletedAt: FORGED_AT.toISOString(),
      });

    expect(response.status).toBe(204);

    const banned = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });

    assert(banned.bannedAt !== null, "ban should have been applied");
    expect(banned.bannedAt.getTime()).toBeGreaterThan(FORGED_AT.getTime());
    expect(banned).toMatchObject({
      bannedBy: actor.id,
      banReason: "spam",
      status: target.status,
      deletedAt: null,
    });
  });
});

describe("POST /api/v1/users/:id/reactivate", () => {
  it("should discard status and deletedAt from the body — the request only issues the token, the owner reactivates", async () => {
    const target = await buildHybrid({ employeeRoles: ["attendant"] });
    await softDeleteUserAndInvalidateSessions(target.id);
    const manager = await buildEmployee({ roleNames: ["manager"] });
    const token = await loginAs(manager.email, manager.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/reactivate`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        profiles: ["CUSTOMER"],
        status: "ACTIVE",
        deletedAt: null,
        mustChangePassword: false,
      });

    expect(response.status).toBe(204);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: target.id },
    });

    expect(user.deletedAt).not.toBeNull();
    expect(user.status).toBe(target.status);
  });
});

describe("POST /api/v1/auth/change-password", () => {
  it("should discard forced-password, status and deletion marks and only rotate the hash", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);

    const before = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    const response = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: user.password,
        newPassword: "NovaSenha2026!",
        mustChangePassword: true,
        status: "BANNED",
        deletedAt: FORGED_AT.toISOString(),
        passwordHash: "$2b$10$forged",
      });

    expect(response.status).toBe(204);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.passwordHash).not.toBe("$2b$10$forged");
    expect(after).toMatchObject({
      mustChangePassword: false,
      status: before.status,
      deletedAt: null,
    });
  });
});

describe("POST /api/v1/auth/change-email", () => {
  it("should discard email and pendingEmail from the body — the new address only lands in pendingEmail, via newEmail", async () => {
    const user = await buildCustomer();
    const token = await loginAs(user.email, user.password);
    const newEmail = faker.internet.email().toLowerCase();

    const response = await request(app)
      .post("/api/v1/auth/change-email")
      .set("Authorization", `Bearer ${token}`)
      .send({
        currentPassword: user.password,
        newEmail,
        email: "forged@example.com",
        pendingEmail: "forged@example.com",
        status: "ACTIVE",
      });

    expect(response.status).toBe(204);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(after.email).toBe(user.email);
    expect(after.pendingEmail).toBe(newEmail);
  });
});

// ─── Perfil e autorização ───────────────────────────────────────────────────

describe("POST /api/v1/users/:userId/customer", () => {
  it("should discard userId and deletedAt from the body and attach the profile to the user in the path", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(actor.email, actor.password);

    const response = await request(app)
      .post(`/api/v1/users/${target.id}/customer`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        phone: "11987654321",
        userId: actor.id,
        deletedAt: FORGED_AT.toISOString(),
      });

    expect(response.status).toBe(201);

    const profile = await prisma.customer.findUnique({
      where: { userId: target.id },
    });

    expect(profile).toMatchObject({ phone: "11987654321", deletedAt: null });
    expect(
      await prisma.customer.findUnique({ where: { userId: actor.id } }),
    ).toBeNull();
  });
});

describe("PUT /api/v1/users/:userId/roles/:roleId/features/:featureId", () => {
  it("should discard deletedAt, userRoleId and ids from the body and write the override for the path triple", async () => {
    const actor = await buildEmployee({ roleNames: ["manager"] });
    const target = await buildEmployee({ roleNames: ["attendant"] });
    const token = await loginAs(actor.email, actor.password);

    const role = await getRoleByName("attendant");
    const feature = await getFeatureByName("read:user:others");
    assert(role !== null && feature !== null, "seeded role/feature expected");

    const response = await request(app)
      .put(`/api/v1/users/${target.id}/roles/${role.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        granted: true,
        deletedAt: FORGED_AT.toISOString(),
        userRoleId: faker.string.uuid(),
        userId: actor.id,
        featureId: faker.string.uuid(),
      });

    expect(response.status).toBe(200);

    const overrides = await prisma.userFeature.findMany({
      where: { userRole: { userId: { in: [target.id, actor.id] } } },
      include: { userRole: true },
    });

    expect(overrides).toHaveLength(1);
    expect(overrides[0]).toMatchObject({
      featureId: feature.id,
      granted: true,
      deletedAt: null,
      userRole: { userId: target.id, roleId: role.id },
    });
  });
});

// ─── Pet ────────────────────────────────────────────────────────────────────

describe("PATCH /api/v1/pets/:petId", () => {
  it("should refuse customerId, deceasedAt, photoPath and deletedAt by name and leave the row untouched", async () => {
    const owner = await buildCustomer();
    const other = await buildCustomer();
    assert(owner.customer !== null && other.customer !== null);

    const pet = await buildPet(owner.customer.id);
    const token = await loginAs(owner.email, owner.password);

    const before = await prisma.pet.findUniqueOrThrow({
      where: { id: pet.id },
    });

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        customerId: other.customer.id,
        deceasedAt: FORGED_AT.toISOString(),
        photoPath: "uploads/forged.webp",
        deletedAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, [
      "customerId",
      "deceasedAt",
      "photoPath",
      "deletedAt",
    ]);

    const after = await prisma.pet.findUniqueOrThrow({
      where: { id: pet.id },
    });

    expect(after).toEqual(before);
  });
});

// ─── Catálogo ───────────────────────────────────────────────────────────────

describe("PATCH /api/v1/products/:productId", () => {
  it("should refuse deletedAt, createdAt and id by name and leave the row untouched", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);
    const token = await loginAsCatalogManager();

    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    const response = await request(app)
      .patch(`/api/v1/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        id: faker.string.uuid(),
        createdAt: FORGED_AT.toISOString(),
        deletedAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, ["id", "createdAt", "deletedAt"]);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/variants/:variantId", () => {
  it("should refuse productId and deletedAt by name and leave the row untouched", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);
    const otherProduct = await buildProduct(brand.id, category.id);
    const token = await loginAsCatalogManager();

    const variant = product.variants[0];
    assert(variant !== undefined, "product should have a variant");

    const before = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    const response = await request(app)
      .patch(`/api/v1/variants/${variant.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        label: "Rótulo legítimo",
        productId: otherProduct.id,
        deletedAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, ["productId", "deletedAt"]);

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/brands/:brandId", () => {
  it("should refuse logoPath and deletedAt by name and leave the row untouched", async () => {
    const { brand } = await buildCatalogTaxonomy();
    const token = await loginAsCatalogManager();

    const before = await prisma.brand.findUniqueOrThrow({
      where: { id: brand.id },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        logoPath: "uploads/forged.webp",
        deletedAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, ["logoPath", "deletedAt"]);

    const after = await prisma.brand.findUniqueOrThrow({
      where: { id: brand.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/categories/:categoryId", () => {
  it("should refuse deletedAt and id by name and leave the row untouched", async () => {
    const { category } = await buildCatalogTaxonomy();
    const token = await loginAsCatalogManager();

    const before = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    });

    const response = await request(app)
      .patch(`/api/v1/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        id: faker.string.uuid(),
        deletedAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, ["id", "deletedAt"]);

    const after = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/tags/:tagId", () => {
  it("should refuse id and createdAt by name and leave the row untouched", async () => {
    const token = await loginAsCatalogManager();
    const tag = await prisma.tag.create({
      data: { name: "Promoção", slug: "promocao" },
    });

    const response = await request(app)
      .patch(`/api/v1/tags/${tag.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Nome legítimo",
        id: faker.string.uuid(),
        createdAt: FORGED_AT.toISOString(),
      });

    expectKeysRefused(response, ["id", "createdAt"]);

    const after = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } });

    expect(after).toEqual(tag);
  });
});
