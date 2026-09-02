import { existsSync } from "node:fs";
import path from "node:path";
import { buildPet } from "@tests/factories/pet.factory";
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

async function png() {
  return sharp({
    create: {
      width: 80,
      height: 80,
      channels: 3,
      background: { r: 3, g: 140, b: 90 },
    },
  })
    .png()
    .toBuffer();
}

function onDisk(key: string, size: "full" | "thumb") {
  return existsSync(path.join(env.UPLOAD_DIR, `${key}-${size}.webp`));
}

/** Cliente com um pet próprio, já logado. */
async function seedOwnerWithPet() {
  const customer = await buildCustomer();
  const token = await loginAs(customer.email, customer.password);
  const profile = await prisma.customer.findFirstOrThrow({
    where: { userId: customer.id },
  });
  const pet = await buildPet(profile.id);

  return { customer, token, pet };
}

function putPhoto(petId: string, token: string, buffer: Buffer) {
  return request(app)
    .put(`/api/v1/pets/${petId}/photo`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", buffer, { filename: "bidu.png", contentType: "image/png" });
}

describe("PUT /api/v1/pets/:petId/photo", () => {
  it("lets the owner set the photo and answers with the pet", async () => {
    const { token, pet } = await seedOwnerWithPet();

    const response = await putPhoto(pet.id, token, await png());

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(pet.id);
    expect(response.body.photo).toEqual({
      fullUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
      thumbUrl: expect.stringContaining(env.UPLOAD_PUBLIC_BASE_URL),
    });
    // A chave do disco nunca sai na resposta (AA2/AA9).
    expect(response.body.photoPath).toBeUndefined();

    const row = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });

    expect(row.photoPath).toMatch(new RegExp(`^pets/${pet.id}/`));
    expect(onDisk(row.photoPath as string, "full")).toBe(true);
    expect(onDisk(row.photoPath as string, "thumb")).toBe(true);
  });

  it("replaces the previous photo and deletes the old file", async () => {
    const { token, pet } = await seedOwnerWithPet();

    await putPhoto(pet.id, token, await png()).expect(200);
    const first = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });

    await putPhoto(pet.id, token, await png()).expect(200);
    const second = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });

    expect(second.photoPath).not.toBe(first.photoPath);
    expect(onDisk(first.photoPath as string, "full")).toBe(false);
    expect(onDisk(second.photoPath as string, "full")).toBe(true);
  });

  it("refuses a disguised file", async () => {
    const { token, pet } = await seedOwnerWithPet();

    const response = await request(app)
      .put(`/api/v1/pets/${pet.id}/photo`)
      .set("Authorization", `Bearer ${token}`)
      .attach("file", Buffer.from("GIF89a nem tento"), {
        filename: "bidu.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(422);
    expectValidationError(response, ["file"]);

    const row = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });
    expect(row.photoPath).toBeNull();
  });

  it("refuses a customer touching someone else's pet, and lets staff through", async () => {
    const { pet } = await seedOwnerWithPet();

    const stranger = await buildCustomer();
    const strangerToken = await loginAs(stranger.email, stranger.password);

    const forbidden = await putPhoto(pet.id, strangerToken, await png());
    expect(forbidden.status).toBe(403);

    const staff = await buildEmployee({ roleNames: ["attendant"] });
    const staffToken = await loginAs(staff.email, staff.password);

    const allowed = await putPhoto(pet.id, staffToken, await png());
    expect(allowed.status).toBe(200);
  });

  it("stays 403 for a pet that does not exist, so the route is no existence oracle", async () => {
    const customer = await buildCustomer();
    const token = await loginAs(customer.email, customer.password);

    const response = await putPhoto(crypto.randomUUID(), token, await png());

    expect(response.status).toBe(403);
  });

  it("records the change against the pet", async () => {
    const { token, pet } = await seedOwnerWithPet();

    await putPhoto(pet.id, token, await png()).expect(200);

    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { action: "PET_PHOTO_UPDATED" },
    });

    expect(entry.targetType).toBe("Pet");
    expect(entry.targetId).toBe(pet.id);
  });
});

describe("DELETE /api/v1/pets/:petId/photo", () => {
  it("removes the file and clears the column", async () => {
    const { token, pet } = await seedOwnerWithPet();

    await putPhoto(pet.id, token, await png()).expect(200);
    const stored = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });

    const response = await request(app)
      .delete(`/api/v1/pets/${pet.id}/photo`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(onDisk(stored.photoPath as string, "full")).toBe(false);

    const row = await prisma.pet.findFirstOrThrow({ where: { id: pet.id } });
    expect(row.photoPath).toBeNull();
  });

  it("is idempotent on a pet with no photo — the desired state is already the current one", async () => {
    const { token, pet } = await seedOwnerWithPet();

    const response = await request(app)
      .delete(`/api/v1/pets/${pet.id}/photo`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
  });
});

describe("PATCH /api/v1/pets/:petId", () => {
  it("still refuses photoPath in the body, so upload stays the only way in", async () => {
    const { token, pet } = await seedOwnerWithPet();

    const response = await request(app)
      .patch(`/api/v1/pets/${pet.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ photoPath: "pets/qualquer/coisa" });

    expect(response.status).toBe(422);
    expectValidationError(response, ["photoPath"]);
  });
});
