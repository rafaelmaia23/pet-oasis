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
import { MAX_IMAGES_PER_PRODUCT } from "@/modules/product/product.image.constants";

afterEach(async () => {
  await clearDatabase();
  await flushRedis();
});

async function jpeg(size = 60) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 200, g: 60, b: 10 },
    },
  })
    .jpeg()
    .toBuffer();
}

async function loginAsCatalogManager() {
  const user = await buildEmployee({ roleNames: ["catalog-manager"] });

  return loginAs(user.email, user.password);
}

// `ACTIVE` de propósito: o default do domínio é `DRAFT`, invisível para quem
// não tem `read:product:internal` — e boa parte destes casos lê a vitrine como
// anônimo.
async function seedProduct() {
  const { brand, category } = await buildCatalogTaxonomy();

  return buildProduct(brand.id, category.id, { status: "ACTIVE" });
}

function upload(productId: string, token: string, buffer: Buffer) {
  return request(app)
    .post(`/api/v1/products/${productId}/images`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, {
      filename: "foto.jpg",
      contentType: "image/jpeg",
    });
}

function onDisk(key: string, size: "full" | "thumb") {
  return existsSync(path.join(env.UPLOAD_DIR, `${key}-${size}.webp`));
}

describe("POST /api/v1/products/:productId/images", () => {
  it("stores both derivatives and answers 201 with the created image", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const response = await upload(product.id, token, await jpeg());

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(String),
      position: 0,
      fullUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
      thumbUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
    });

    const row = await prisma.productImage.findFirstOrThrow({
      where: { productId: product.id },
    });

    // O banco guarda a CHAVE, nunca a URL completa (AA9/AA2).
    expect(row.path).toMatch(new RegExp(`^products/${product.id}/`));
    expect(row.path).not.toContain("http");
    expect(onDisk(row.path, "full")).toBe(true);
    expect(onDisk(row.path, "thumb")).toBe(true);
  });

  it("appends each new image at the end instead of fighting for position 0", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const first = await upload(product.id, token, await jpeg());
    const second = await upload(product.id, token, await jpeg());

    expect(first.body.position).toBe(0);
    expect(second.body.position).toBe(1);
  });

  it("never lets the filename the user chose become a path on disk", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    await request(app)
      .post(`/api/v1/products/${product.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", await jpeg(), {
        filename: "../../../etc/passwd.jpg",
        contentType: "image/jpeg",
      })
      .expect(201);

    const row = await prisma.productImage.findFirstOrThrow({
      where: { productId: product.id },
    });

    expect(row.path).not.toContain("passwd");
    expect(row.path).not.toContain("..");
  });

  it("refuses a file whose bytes are not an image, whatever the extension claims", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/images`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("<!doctype html><script>alert(1)</script>"), {
        filename: "inocente.jpg",
        contentType: "image/jpeg",
      });

    expect(response.status).toBe(422);
    expectValidationError(response, ["file"]);
    expect(await prisma.productImage.count()).toBe(0);
  });

  it("refuses a request with no file at all", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const response = await request(app)
      .post(`/api/v1/products/${product.id}/images`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);
    expectValidationError(response, ["file"]);
  });

  it("answers 413 when the file is over the cap", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const tooBig = Buffer.alloc(env.UPLOAD_MAX_FILE_SIZE_BYTES + 1024, 1);

    const response = await upload(product.id, token, tooBig);

    expect(response.status).toBe(413);
    expect(await prisma.productImage.count()).toBe(0);
  });

  it(`refuses image number ${MAX_IMAGES_PER_PRODUCT + 1}`, async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();
    const buffer = await jpeg();

    for (let index = 0; index < MAX_IMAGES_PER_PRODUCT; index++) {
      await upload(product.id, token, buffer).expect(201);
    }

    const response = await upload(product.id, token, buffer);

    expect(response.status).toBe(422);
    expectValidationError(response, ["file"]);
    expect(await prisma.productImage.count()).toBe(MAX_IMAGES_PER_PRODUCT);
  });

  it("answers 404 for a product that does not exist", async () => {
    const token = await loginAsCatalogManager();

    const response = await upload(crypto.randomUUID(), token, await jpeg());

    expect(response.status).toBe(404);
  });

  it("answers 401 without a token and 403 for a customer", async () => {
    const product = await seedProduct();
    const buffer = await jpeg();

    const anonymous = await request(app)
      .post(`/api/v1/products/${product.id}/images`)
      .attach("file", buffer, { filename: "foto.jpg" });

    expect(anonymous.status).toBe(401);

    const customer = await buildCustomer();
    const customerToken = await loginAs(customer.email, customer.password);

    const forbidden = await upload(product.id, customerToken, buffer);

    expect(forbidden.status).toBe(403);
    expect(await prisma.productImage.count()).toBe(0);
  });

  it("refuses the demo account, which can read the whole catalogue but write nothing", async () => {
    const demo = await buildEmployee({ roleNames: ["demo"] });
    const token = await loginAs(demo.email, demo.password);
    const product = await seedProduct();

    const response = await upload(product.id, token, await jpeg());

    expect(response.status).toBe(403);
    expect(await prisma.productImage.count()).toBe(0);
  });

  it("records the upload in the audit log against the product", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const response = await upload(product.id, token, await jpeg());

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PRODUCT_IMAGE_UPLOADED" },
    });

    expect(entry.targetType).toBe("Product");
    expect(entry.targetId).toBe(product.id);
    expect(entry.metadata).toMatchObject({ imageId: response.body.id });
  });
});

describe("images in the product views", () => {
  it("shows the ordered array on the detail and only the cover on the list", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();

    const first = await upload(product.id, token, await jpeg());
    await upload(product.id, token, await jpeg());

    const detail = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(detail.body.images).toHaveLength(2);
    expect(detail.body.images[0]).toEqual({
      id: first.body.id,
      position: 0,
      fullUrl: first.body.fullUrl,
      thumbUrl: first.body.thumbUrl,
    });

    const list = await request(app).get("/api/v1/products").expect(200);
    const listed = list.body.data[0];

    // A lista carrega a capa, não a coleção: 20 produtos × 8 imagens seria
    // payload que nenhum cliente de vitrine usa.
    expect(listed.images).toBeUndefined();
    expect(listed.image).toEqual({
      fullUrl: first.body.fullUrl,
      thumbUrl: first.body.thumbUrl,
    });
  });

  it("says null on the list and an empty array on the detail when there is no image", async () => {
    const product = await seedProduct();

    const list = await request(app).get("/api/v1/products").expect(200);
    const detail = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(list.body.data[0].image).toBeNull();
    expect(detail.body.images).toEqual([]);
  });
});

describe("DELETE /api/v1/products/:productId/images/:imageId", () => {
  it("removes the row and both files from disk", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();
    const uploaded = await upload(product.id, token, await jpeg());

    const row = await prisma.productImage.findFirstOrThrow({
      where: { id: uploaded.body.id },
    });

    const response = await request(app)
      .delete(`/api/v1/products/${product.id}/images/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(await prisma.productImage.count()).toBe(0);
    expect(onDisk(row.path, "full")).toBe(false);
    expect(onDisk(row.path, "thumb")).toBe(false);
  });

  it("compacts the remaining positions, so deleting the cover promotes the next one", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();
    const cover = await upload(product.id, token, await jpeg());
    const second = await upload(product.id, token, await jpeg());

    await request(app)
      .delete(`/api/v1/products/${product.id}/images/${cover.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const detail = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(detail.body.images).toHaveLength(1);
    expect(detail.body.images[0]).toMatchObject({
      id: second.body.id,
      position: 0,
    });
  });

  it("answers 404 for an image that belongs to another product", async () => {
    const token = await loginAsCatalogManager();
    const mine = await seedProduct();
    const other = await seedProduct();
    const uploaded = await upload(other.id, token, await jpeg());

    const response = await request(app)
      .delete(`/api/v1/products/${mine.id}/images/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${token}`);

    // Indistinguível de um id inventado: o path nomeia um recurso que de fato
    // não existe, e um 422 explicando o descasamento confirmaria a existência
    // da imagem no outro produto (AA11).
    expect(response.status).toBe(404);
    expect(await prisma.productImage.count()).toBe(1);
  });

  it("records the deletion against the product", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();
    const uploaded = await upload(product.id, token, await jpeg());

    await request(app)
      .delete(`/api/v1/products/${product.id}/images/${uploaded.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PRODUCT_IMAGE_DELETED" },
    });

    expect(entry.targetType).toBe("Product");
    expect(entry.targetId).toBe(product.id);
    expect(entry.metadata).toMatchObject({ imageId: uploaded.body.id });
  });
});

describe("PATCH /api/v1/products/:productId/images/order", () => {
  async function seedThreeImages(token: string) {
    const product = await seedProduct();
    const buffer = await jpeg();

    const first = await upload(product.id, token, buffer);
    const second = await upload(product.id, token, buffer);
    const third = await upload(product.id, token, buffer);

    return {
      product,
      ids: [first.body.id, second.body.id, third.body.id] as string[],
    };
  }

  function reorder(productId: string, token: string, images: string[]) {
    return request(app)
      .patch(`/api/v1/products/${productId}/images/order`)
      .set("Authorization", `Bearer ${token}`)
      .send({ images });
  }

  it("rewrites the whole block and moves the cover to position 0", async () => {
    const token = await loginAsCatalogManager();
    const { product, ids } = await seedThreeImages(token);
    const [first, second, third] = ids as [string, string, string];

    const response = await reorder(product.id, token, [third, first, second]);

    expect(response.status).toBe(200);
    expect(response.body.data.map((image: { id: string }) => image.id)).toEqual([
      third,
      first,
      second,
    ]);

    const list = await request(app).get("/api/v1/products").expect(200);
    const detail = await request(app)
      .get(`/api/v1/products/${product.id}`)
      .expect(200);

    expect(detail.body.images[0].id).toBe(third);
    // A capa da listagem é a posição 0, sem flag própria (AA13) — reordenar é
    // o único jeito de trocá-la, e é o mesmo dado que o detalhe mostra.
    expect(list.body.data[0].image).toEqual({
      fullUrl: detail.body.images[0].fullUrl,
      thumbUrl: detail.body.images[0].thumbUrl,
    });
  });

  it("is idempotent — sending the current order changes nothing", async () => {
    const token = await loginAsCatalogManager();
    const { product, ids } = await seedThreeImages(token);

    await reorder(product.id, token, ids).expect(200);
    const response = await reorder(product.id, token, ids);

    expect(response.status).toBe(200);
    expect(response.body.data.map((image: { id: string }) => image.id)).toEqual(
      ids,
    );
  });

  it("refuses an array that is not the exact set of the product's images", async () => {
    const token = await loginAsCatalogManager();
    const { product, ids } = await seedThreeImages(token);

    const response = await reorder(product.id, token, ids.slice(0, 2));

    expect(response.status).toBe(422);
    expectValidationError(response, ["images"]);
  });

  it("refuses a repeated id instead of leaving an image without a position", async () => {
    const token = await loginAsCatalogManager();
    const { product, ids } = await seedThreeImages(token);
    const [first] = ids as [string, string, string];

    const response = await reorder(product.id, token, [first, first, first]);

    expect(response.status).toBe(422);
    expectValidationError(response, ["images"]);
  });

  it("answers 404 when the array names an image of another product", async () => {
    const token = await loginAsCatalogManager();
    const { product, ids } = await seedThreeImages(token);
    const other = await seedProduct();
    const foreign = await upload(other.id, token, await jpeg());
    const [, second, third] = ids as [string, string, string];

    const response = await reorder(product.id, token, [
      foreign.body.id,
      second,
      third,
    ]);

    expect(response.status).toBe(404);
  });
});

describe("product lifecycle and its files", () => {
  it("keeps the files when the product is soft deleted", async () => {
    const token = await loginAsCatalogManager();
    const product = await seedProduct();
    const uploaded = await upload(product.id, token, await jpeg());

    const row = await prisma.productImage.findFirstOrThrow({
      where: { id: uploaded.body.id },
    });

    await request(app)
      .delete(`/api/v1/products/${product.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(204);

    // AA16: apagar o byte no soft delete tornaria a restauração da Fase 8 uma
    // promessa parcial — o produto voltaria sem imagem, e em silêncio.
    expect(onDisk(row.path, "full")).toBe(true);
    expect(onDisk(row.path, "thumb")).toBe(true);
  });
});
