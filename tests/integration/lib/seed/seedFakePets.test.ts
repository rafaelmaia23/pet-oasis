import { clearDatabase } from "@tests/helpers/database";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { FAKE_PET_ROSTER } from "@/lib/seed/fakePets.constants";
import { fakeEmail } from "@/lib/seed/fakeUsers.constants";
import { seedFakePets } from "@/lib/seed/seedFakePets";
import { seedFakeUsers } from "@/lib/seed/seedFakeUsers";
import { storage } from "@/lib/storage";

afterEach(async () => {
  await clearDatabase();
});

const withoutImages = { withImages: false } as const;

/** Os pets se amarram aos customers por email fixo, então os donos vêm antes. */
async function seedOwnersAndPets(
  options: { withImages?: boolean } = withoutImages,
) {
  await seedFakeUsers();

  return seedFakePets(options);
}

async function findPet(name: string) {
  return prisma.pet.findFirstOrThrow({
    where: { name },
    include: { breed: true, customer: { include: { user: true } } },
  });
}

describe("seedFakePets", () => {
  it("creates every pet in the roster on the first run", async () => {
    const result = await seedOwnersAndPets();

    expect(result.createdCount).toBe(FAKE_PET_ROSTER.length);
    expect(result.skippedCount).toBe(0);
    expect(await prisma.pet.count()).toBe(FAKE_PET_ROSTER.length);
  });

  it("is idempotent — a second run creates nothing new", async () => {
    await seedOwnersAndPets();
    const result = await seedFakePets(withoutImages);

    expect(result.createdCount).toBe(0);
    expect(result.skippedCount).toBe(FAKE_PET_ROSTER.length);
    expect(await prisma.pet.count()).toBe(FAKE_PET_ROSTER.length);
  });

  it("refuses to run before the owners exist, instead of silently skipping", async () => {
    await expect(seedFakePets(withoutImages)).rejects.toThrow(
      /rode seedFakeUsers antes/,
    );
  });

  it("resolves the breed by name over the seeded reference catalog", async () => {
    await seedOwnersAndPets();

    const thor = await findPet("Thor");

    expect(thor.breed?.name).toBe("Golden Retriever");
    expect(thor.species).toBe("DOG");
  });

  it("leaves breedId null for the species that forbid a breed", async () => {
    await seedOwnersAndPets();

    const pipoca = await findPet("Pipoca");
    const tofu = await findPet("Tofu");

    expect(pipoca.species).toBe("RABBIT");
    expect(pipoca.breedId).toBeNull();
    expect(tofu.species).toBe("RODENT");
    expect(tofu.breedId).toBeNull();
  });

  it("gives customer01 three pets and customer08 none", async () => {
    await seedOwnersAndPets();

    const withThree = await prisma.customer.findFirstOrThrow({
      where: { user: { email: fakeEmail("customer01") } },
      include: { pets: true },
    });
    const withNone = await prisma.customer.findFirstOrThrow({
      where: { user: { email: fakeEmail("customer08") } },
      include: { pets: true },
    });

    expect(withThree.pets).toHaveLength(3);
    // Lista vazia é um estado que a API responde e a UI precisa tratar.
    expect(withNone.pets).toHaveLength(0);
  });

  it("marks the deceased pet with a fixed date, keeping it out of the living list", async () => {
    await seedOwnersAndPets();

    const rex = await findPet("Rex");

    expect(rex.deceasedAt).toEqual(new Date("2024-10-02"));
    expect(rex.deletedAt).toBeNull();
  });

  it("soft-deletes the pet that stands for a cadastral mistake", async () => {
    await seedOwnersAndPets();

    const fumaca = await findPet("Fumaça");

    expect(fumaca.deletedAt).not.toBeNull();
    // O dono continua vivo: este pet morreu por si, não por cascata.
    expect(fumaca.customer.deletedAt).toBeNull();
  });

  it("leaves the microchip null where the roster says so", async () => {
    await seedOwnersAndPets();

    const amora = await findPet("Amora");

    expect(amora.microchipId).toBeNull();
  });

  it("keeps every microchip distinct, because the unique index ignores deletedAt", async () => {
    await seedOwnersAndPets();

    const chips = (
      await prisma.pet.findMany({ where: { microchipId: { not: null } } })
    ).map((pet) => pet.microchipId);

    expect(new Set(chips).size).toBe(chips.length);
  });

  /**
   * O cenário que encosta na cascata da Fase 8: nunca existe filho ativo de pai
   * morto. O pet do dono soft-deletado **herda o `deletedAt` do dono**, e não um
   * timestamp próprio — é a correlação de timestamp que a restauração usa para
   * decidir o que ressuscita junto com o perfil.
   */
  it("makes the pet of a soft-deleted owner inherit the owner's deletedAt", async () => {
    await seedOwnersAndPets();

    const pretinha = await findPet("Pretinha");

    expect(pretinha.customer.deletedAt).not.toBeNull();
    expect(pretinha.deletedAt).toEqual(pretinha.customer.deletedAt);
  });

  it("keeps the pet of a banned owner active, because the ban is on the account", async () => {
    await seedOwnersAndPets();

    const duque = await findPet("Duque");

    expect(duque.customer.user.bannedAt).not.toBeNull();
    expect(duque.deletedAt).toBeNull();
  });

  it("stores the photo through the storage adapter, and only for the pets that declare one", async () => {
    const result = await seedOwnersAndPets({ withImages: true });

    const expected = FAKE_PET_ROSTER.filter((pet) => pet.photo !== null).length;

    expect(result.photosStored).toBe(expected);

    const withPhoto = await prisma.pet.findFirstOrThrow({
      where: { name: "Thor" },
    });
    const withoutPhoto = await prisma.pet.findFirstOrThrow({
      where: { name: "Bidu" },
    });

    expect(withPhoto.photoPath).not.toBeNull();
    expect(withPhoto.photoPath).toMatch(new RegExp(`^pets/${withPhoto.id}/`));
    expect(await storage.countFiles(`pets/${withPhoto.id}`)).toBe(2);

    expect(withoutPhoto.photoPath).toBeNull();
    expect(await storage.countFiles(`pets/${withoutPhoto.id}`)).toBe(0);
  }, 60_000);
});
