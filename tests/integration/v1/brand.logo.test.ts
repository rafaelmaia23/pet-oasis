import { existsSync } from "node:fs";
import path from "node:path";
import {
  buildCatalogTaxonomy,
  buildProduct,
} from "@tests/factories/product.factory";
import { buildCustomer, buildEmployee } from "@tests/factories/user.factory";
import { expectValidationError } from "@tests/helpers/assertions";
import { loginAs } from "@tests/helpers/auth";
import { clearDatabase } from "@tests/helpers/database";
import { flushRedis } from "@tests/helpers/redis";
import sharp from "sharp";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "@/app";
import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

async function webp() {
  return sharp({
    create: {
      width: 90,
      height: 90,
      channels: 3,
      background: { r: 240, g: 200, b: 30 },
    },
  })
    .webp()
    .toBuffer();
}

function onDisk(key: string, size: "full" | "thumb") {
  return existsSync(path.join(env.UPLOAD_DIR, `${key}-${size}.webp`));
}

/** Logo é estrutura de catálogo, não autoria de produto (9.1). */
async function loginAsStructureManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

function putLogo(brandId: string, token: string, buffer: Buffer) {
  return request(app)
    .put(`/api/v1/brands/${brandId}/logo`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, {
      filename: "logo.webp",
      contentType: "image/webp",
    });
}

describe("PUT /api/v1/brands/:brandId/logo", () => {
  it("stores the logo and answers with the brand carrying both URLs", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await putLogo(brand.id, token, await webp());

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(brand.id);
    expect(response.body.logo).toEqual({
      fullUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
      thumbUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
    });
    expect(response.body.logoPath).toBeUndefined();

    const row = await prisma.brand.findFirstOrThrow({
      where: { id: brand.id },
    });

    expect(row.logoPath).toMatch(new RegExp(`^brands/${brand.id}/`));
    expect(onDisk(row.logoPath as string, "full")).toBe(true);
    expect(onDisk(row.logoPath as string, "thumb")).toBe(true);
  });

  it("replaces the previous logo and deletes the old file", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    await putLogo(brand.id, token, await webp()).expect(200);
    const first = await prisma.brand.findFirstOrThrow({
      where: { id: brand.id },
    });

    await putLogo(brand.id, token, await webp()).expect(200);
    const second = await prisma.brand.findFirstOrThrow({
      where: { id: brand.id },
    });

    expect(second.logoPath).not.toBe(first.logoPath);
    expect(onDisk(first.logoPath as string, "full")).toBe(false);
    expect(onDisk(second.logoPath as string, "full")).toBe(true);
  });

  it("refuses a disguised file and answers 404 for a brand that does not exist", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const disguised = await request(app)
      .put(`/api/v1/brands/${brand.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("%PDF-1.7"), {
        filename: "logo.png",
        contentType: "image/png",
      });

    expect(disguised.status).toBe(422);
    expectValidationError(disguised, ["file"]);

    const missing = await putLogo(crypto.randomUUID(), token, await webp());

    expect(missing.status).toBe(404);
  });

  it("answers 401 anonymously and 403 for someone without manage:catalog-structure", async () => {
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });
    const buffer = await webp();

    const anonymous = await request(app)
      .put(`/api/v1/brands/${brand.id}/logo`)
      .attach("file", buffer, { filename: "logo.webp" });

    expect(anonymous.status).toBe(401);

    const customer = await buildCustomer();
    const customerToken = await loginAs(customer.email, customer.password);

    const forbidden = await putLogo(brand.id, customerToken, buffer);

    expect(forbidden.status).toBe(403);
  });

  it("records the change against the brand", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    await putLogo(brand.id, token, await webp()).expect(200);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "BRAND_LOGO_UPDATED" },
    });

    expect(entry.targetType).toBe("Brand");
    expect(entry.targetId).toBe(brand.id);
  });
});

describe("DELETE /api/v1/brands/:brandId/logo", () => {
  it("removes the file, clears the column and is idempotent", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    await putLogo(brand.id, token, await webp()).expect(200);
    const stored = await prisma.brand.findFirstOrThrow({
      where: { id: brand.id },
    });

    await request(app)
      .delete(`/api/v1/brands/${brand.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    expect(onDisk(stored.logoPath as string, "full")).toBe(false);

    const row = await prisma.brand.findFirstOrThrow({
      where: { id: brand.id },
    });
    expect(row.logoPath).toBeNull();

    // Segunda vez: o estado desejado já é o atual.
    await request(app)
      .delete(`/api/v1/brands/${brand.id}/logo`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);
  });
});

describe("the brand logo inside the product views", () => {
  it("travels with the brand nested in the product, as URLs and not as a key", async () => {
    const token = await loginAsStructureManager();
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id, {
      status: "ACTIVE",
    });

    await putLogo(brand.id, token, await webp()).expect(200);

    const detail = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(detail.body.brand.logo).toEqual({
      fullUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
      thumbUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
    });
    expect(detail.body.brand.logoPath).toBeUndefined();
  });
});

describe("PATCH /api/v1/brands/:brandId", () => {
  it("still refuses logoPath in the body, so upload stays the only way in", async () => {
    const token = await loginAsStructureManager();
    const brand = await prisma.brand.create({
      data: { name: "Golden", slug: "golden" },
    });

    const response = await request(app)
      .patch(`/api/v1/brands/${brand.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ logoPath: "brands/qualquer/coisa" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["logoPath"]);
  });
});
