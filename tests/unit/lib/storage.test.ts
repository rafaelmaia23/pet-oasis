import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { env } from "@/config/env";
import {
  deleteImage,
  deleteOwnerImages,
  detectImageFormat,
  IMAGE_DIMENSIONS,
  imageUrls,
  storeImage,
} from "@/lib/storage";

/**
 * Testes do adaptador **sem HTTP**: o pipeline (magic bytes → sharp → disco) é
 * onde moram as garantias de segurança da 9.10, e elas não deveriam precisar de
 * um request para serem afirmadas.
 *
 * `UPLOAD_DIR` aponta para um diretório único deste run (criado no
 * `vitest.config.ts`, apagado no teardown do `globalSetup`) — o `LocalDiskStorage`
 * aqui é o de verdade, e o `sharp` também: teste que não exercita o caminho de
 * produção passa em falso.
 */

async function pixels(format: "jpeg" | "png" | "webp", size = 40) {
  const image = sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 10, g: 120, b: 200 },
    },
  });

  return image[format]().toBuffer();
}

function absolute(key: string, suffix: string) {
  return path.join(env.UPLOAD_DIR, `${key}-${suffix}.webp`);
}

describe("detectImageFormat", () => {
  it("recognises the three accepted formats by their magic bytes", async () => {
    expect(detectImageFormat(await pixels("jpeg"))).toBe("jpeg");
    expect(detectImageFormat(await pixels("png"))).toBe("png");
    expect(detectImageFormat(await pixels("webp"))).toBe("webp");
  });

  it("rejects a file whose bytes are not an accepted image, whatever it claims to be", async () => {
    const html = Buffer.from("<!doctype html><script>alert(1)</script>");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const elf = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
    const gif = Buffer.from("GIF89a");

    expect(detectImageFormat(html)).toBeNull();
    expect(detectImageFormat(svg)).toBeNull();
    expect(detectImageFormat(elf)).toBeNull();
    // GIF é recusado de propósito (AA5): animação viraria quadro único em silêncio.
    expect(detectImageFormat(gif)).toBeNull();
  });

  it("rejects a buffer too short to carry any signature", () => {
    expect(detectImageFormat(Buffer.from([0xff]))).toBeNull();
  });
});

describe("storeImage", () => {
  it("writes both derivatives as WebP under <owner>/<ownerId>/<uuid>", async () => {
    const ownerId = crypto.randomUUID();
    const key = await storeImage({
      owner: "products",
      ownerId,
      buffer: await pixels("jpeg", 2000),
    });

    expect(key).toMatch(
      new RegExp(
        `^products/${ownerId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
      ),
    );

    for (const size of ["full", "thumb"] as const) {
      const file = absolute(key, size);
      expect(existsSync(file)).toBe(true);

      const meta = await sharp(await fs.readFile(file)).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.width).toBe(IMAGE_DIMENSIONS.products[size]);
    }
  });

  it("uses the dimensions of the owner, not one number for everybody", async () => {
    const buffer = await pixels("png", 2000);

    const petKey = await storeImage({
      owner: "pets",
      ownerId: crypto.randomUUID(),
      buffer,
    });
    const brandKey = await storeImage({
      owner: "brands",
      ownerId: crypto.randomUUID(),
      buffer,
    });

    const petFull = await sharp(await fs.readFile(absolute(petKey, "full")))
      .metadata()
      .then((meta) => meta.width);
    const brandFull = await sharp(await fs.readFile(absolute(brandKey, "full")))
      .metadata()
      .then((meta) => meta.width);

    expect(petFull).toBe(IMAGE_DIMENSIONS.pets.full);
    expect(brandFull).toBe(IMAGE_DIMENSIONS.brands.full);
    expect(petFull).not.toBe(brandFull);
  });

  it("never enlarges an image smaller than the target", async () => {
    const key = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: await pixels("png", 50),
    });

    const meta = await sharp(await fs.readFile(absolute(key, "full")))
      .metadata()
      .then((data) => data.width);

    expect(meta).toBe(50);
  });

  it("strips EXIF instead of carrying it into the derivative", async () => {
    const withExif = await sharp(await pixels("jpeg", 300))
      .withExifMerge({ IFD0: { Copyright: "quem-subiu" } })
      .jpeg()
      .toBuffer();

    // Prova que o fixture realmente tem EXIF, senão o teste passaria à toa.
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const key = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: withExif,
    });

    const meta = await sharp(await fs.readFile(absolute(key, "full")))
      .metadata()
      .then((data) => data.exif);

    expect(meta).toBeUndefined();
  });

  it("refuses a disguised file before any byte reaches the disk", async () => {
    const ownerId = crypto.randomUUID();

    await expect(
      storeImage({
        owner: "products",
        ownerId,
        buffer: Buffer.from("<!doctype html><script>alert(1)</script>"),
      }),
    ).rejects.toMatchObject({ statusCode: 422 });

    expect(existsSync(path.join(env.UPLOAD_DIR, "products", ownerId))).toBe(
      false,
    );
  });

  it("takes no filename at all, so the name the user chose cannot become a path", async () => {
    // A assinatura não tem por onde receber um nome — a garantia é de
    // construção, não de disciplina. O que se afirma aqui é o efeito: o nome do
    // arquivo no disco é o uuid que nós geramos.
    const ownerId = crypto.randomUUID();
    const key = await storeImage({
      owner: "products",
      ownerId,
      buffer: await pixels("jpeg"),
    });

    const written = await fs.readdir(
      path.join(env.UPLOAD_DIR, "products", ownerId),
    );

    expect(written.sort()).toEqual([
      `${path.basename(key)}-full.webp`,
      `${path.basename(key)}-thumb.webp`,
    ]);
  });
});

describe("imageUrls", () => {
  it("composes both URLs from the public base, never from the disk path", () => {
    const urls = imageUrls("products/abc/def");

    expect(urls).toEqual({
      fullUrl: `${env.UPLOAD_PUBLIC_BASE_URL}/products/abc/def-full.webp`,
      thumbUrl: `${env.UPLOAD_PUBLIC_BASE_URL}/products/abc/def-thumb.webp`,
    });
  });
});

describe("deleteImage", () => {
  it("removes both derivatives", async () => {
    const key = await storeImage({
      owner: "products",
      ownerId: crypto.randomUUID(),
      buffer: await pixels("webp"),
    });

    await deleteImage(key);

    expect(existsSync(absolute(key, "full"))).toBe(false);
    expect(existsSync(absolute(key, "thumb"))).toBe(false);
  });

  it("is idempotent — deleting what is already gone is not an error", async () => {
    await expect(
      deleteImage(`products/${crypto.randomUUID()}/${crypto.randomUUID()}`),
    ).resolves.toBeUndefined();
  });
});

describe("deleteOwnerImages", () => {
  it("removes the whole directory of one owner", async () => {
    const ownerId = crypto.randomUUID();
    await storeImage({
      owner: "products",
      ownerId,
      buffer: await pixels("jpeg"),
    });
    await storeImage({
      owner: "products",
      ownerId,
      buffer: await pixels("jpeg"),
    });

    await deleteOwnerImages("products", ownerId);

    expect(existsSync(path.join(env.UPLOAD_DIR, "products", ownerId))).toBe(
      false,
    );
  });
});
