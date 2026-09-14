import { faker } from "@faker-js/faker";
import { buildPet } from "@tests/factories/pet.factory";
import {
  buildCatalogTaxonomy,
  buildProduct,
} from "@tests/factories/product.factory";
import {
  buildCustomer,
  buildEmployee,
  makeCustomerData,
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
 * recusa (ou descartada, nos schemas strip) e a coluna no banco **não mudou**.
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
 * (`Unrecognized keys: "a", "b"`); um campo `z.never` reporta sob o próprio
 * nome. Os dois são "recusada por nome" — o contrato é que a resposta diga
 * qual chave foi rejeitada, não onde o schema a proibiu.
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

const PAST = new Date("2020-01-01T00:00:00.000Z");

async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

describe("PATCH /api/v1/users/:id — account state is not writable from the body", () => {
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
        bannedAt: PAST.toISOString(),
        bannedBy: faker.string.uuid(),
        banReason: "auto-ban",
        mustChangePassword: true,
        passwordHash: "$2b$10$forged",
        deletedAt: PAST.toISOString(),
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

describe("POST /api/v1/auth/signup — account state is not writable from the body", () => {
  it("should discard status and roleNames and create a PENDING customer with the default role only", async () => {
    const data = makeCustomerData();

    const response = await request(app)
      .post("/api/v1/auth/signup")
      .send({
        ...data,
        status: "ACTIVE",
        roleNames: ["admin"],
        mustChangePassword: false,
        deletedAt: null,
      });

    expect(response.status).toBe(201);

    const created = await prisma.user.findUniqueOrThrow({
      where: { email: data.email },
      include: { roles: { include: { role: true } } },
    });

    expect(created.status).toBe("PENDING");
    expect(created.roles.map((userRole) => userRole.role.name)).toEqual([
      "customer",
    ]);
  });
});

describe("PUT /api/v1/users/:userId/roles/:roleId/features/:featureId — the override's identity comes from the path", () => {
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
        deletedAt: PAST.toISOString(),
        userRoleId: faker.string.uuid(),
        userId: actor.id,
        featureId: faker.string.uuid(),
      });

    expect(response.status).toBe(200);

    const overrides = await prisma.userFeature.findMany({
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

describe("PATCH /api/v1/pets/:petId — ownership and lifecycle are not writable from the body", () => {
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
        deceasedAt: PAST.toISOString(),
        photoPath: "uploads/forged.webp",
        deletedAt: PAST.toISOString(),
      });

    expectKeysRefused(response, [
      "customerId",
      "deceasedAt",
      "photoPath",
      "deletedAt",
    ]);

    const after = await prisma.pet.findUniqueOrThrow({ where: { id: pet.id } });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/products/:productId — lifecycle is not writable from the body", () => {
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
        createdAt: PAST.toISOString(),
        deletedAt: PAST.toISOString(),
      });

    expectKeysRefused(response, ["id", "createdAt", "deletedAt"]);

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/variants/:variantId — parent and lifecycle are not writable from the body", () => {
  it("should refuse productId, deletedAt and isDefault=false by name and leave the row untouched", async () => {
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
        deletedAt: PAST.toISOString(),
        isDefault: false,
      });

    expectKeysRefused(response, ["productId", "deletedAt", "isDefault"]);

    const after = await prisma.productVariant.findUniqueOrThrow({
      where: { id: variant.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/brands/:brandId — upload and lifecycle are not writable from the body", () => {
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
        deletedAt: PAST.toISOString(),
      });

    expectKeysRefused(response, ["logoPath", "deletedAt"]);

    const after = await prisma.brand.findUniqueOrThrow({
      where: { id: brand.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/categories/:categoryId — lifecycle is not writable from the body", () => {
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
        deletedAt: PAST.toISOString(),
      });

    expectKeysRefused(response, ["id", "deletedAt"]);

    const after = await prisma.category.findUniqueOrThrow({
      where: { id: category.id },
    });

    expect(after).toEqual(before);
  });
});

describe("PATCH /api/v1/tags/:tagId — identity is not writable from the body", () => {
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
        createdAt: PAST.toISOString(),
      });

    expectKeysRefused(response, ["id", "createdAt"]);

    const after = await prisma.tag.findUniqueOrThrow({ where: { id: tag.id } });

    expect(after).toEqual(tag);
  });
});
