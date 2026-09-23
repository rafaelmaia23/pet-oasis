import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildCatalogTaxonomy,
  buildProduct,
} from "@tests/factories/product.factory";
import { clearDatabase } from "@tests/helpers/database";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { env } from "@/config/env";
import { prisma } from "@/lib/prisma";
import { storeImage } from "@/lib/storage";
import { cleanupUploads } from "@/scripts/cleanup-uploads";

afterEach(async () => {
  await clearDatabase();
  await fs.rm(path.join(env.UPLOAD_DIR, "products"), {
    recursive: true,
    force: true,
  });
});

async function jpeg() {
  return sharp({
    create: {
      width: 30,
      height: 30,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .jpeg()
    .toBuffer();
}

function file(key: string, size: "full" | "thumb") {
  return path.join(env.UPLOAD_DIR, `${key}-${size}.webp`);
}

/** Envelhece os dois derivados para além da carência. */
async function age(key: string, hours: number) {
  const when = new Date(Date.now() - hours * 60 * 60 * 1000);

  for (const size of ["full", "thumb"] as const) {
    await fs.utimes(file(key, size), when, when);
  }
}

describe("cleanupUploads", () => {
  it("deletes a file that no row points at, once it is past the grace window", async () => {
    const orphan = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: await jpeg(),
    });

    await age(orphan, 48);

    const result = await cleanupUploads({ dryRun: false });

    expect(result.orphansDeleted).toBe(2);
    expect(existsSync(file(orphan, "full"))).toBe(false);
    expect(existsSync(file(orphan, "thumb"))).toBe(false);
  });

  it("leaves a freshly written file alone — it may be an upload still in flight", async () => {
    const inFlight = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: await jpeg(),
    });

    const result = await cleanupUploads({ dryRun: false });

    expect(result.orphansDeleted).toBe(0);
    expect(existsSync(file(inFlight, "full"))).toBe(true);
  });

  it("never touches a file that a row points at, however old it is", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);

    const key = await storeImage({
      owner: "products",
      ownerId: product.id,
      buffer: await jpeg(),
    });
    await prisma.productImage.create({
      data: { productId: product.id, path: key, position: 0 },
    });

    await age(key, 24 * 365);

    const result = await cleanupUploads({ dryRun: false });

    expect(result.orphansDeleted).toBe(0);
    expect(existsSync(file(key, "full"))).toBe(true);
  });

  it("counts without deleting on a dry run", async () => {
    const orphan = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: await jpeg(),
    });

    await age(orphan, 48);

    const result = await cleanupUploads({ dryRun: true });

    expect(result.orphansDeleted).toBe(2);
    expect(existsSync(file(orphan, "full"))).toBe(true);
  });

  it("reports a row whose file is gone and leaves the row where it is", async () => {
    const { brand, category } = await buildCatalogTaxonomy();
    const product = await buildProduct(brand.id, category.id);

    await prisma.productImage.create({
      data: {
        productId: product.id,
        path: `products/${product.id}/${crypto.randomUUID()}`,
        position: 0,
      },
    });

    const result = await cleanupUploads({ dryRun: false });

    expect(result.missingFiles).toBe(1);
    // A linha continua onde estava: apagá-la sumiria com a evidência de que
    // algo quebrou, e a imagem quebrada na vitrine é o que faz alguém olhar.
    expect(await prisma.productImage.count()).toBe(1);
  });

  it("skips a file that does not follow our naming, instead of deleting what it cannot read", async () => {
    const stray = path.join(env.UPLOAD_DIR, "products", "leia-me.txt");

    await fs.mkdir(path.dirname(stray), { recursive: true });
    await fs.writeFile(stray, "nada a ver");
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    await fs.utimes(stray, old, old);

    const result = await cleanupUploads({ dryRun: false });

    expect(result.skippedUnknown).toBe(1);
    expect(existsSync(stray)).toBe(true);
  });
});
