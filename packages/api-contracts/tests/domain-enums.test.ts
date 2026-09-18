import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DOMAIN_ENUMS } from "../src";
import { productStatusSchema } from "../src/catalog";
import { FEATURE_NAMES, PRIVILEGED_FEATURES } from "../src/feature";
import { petSexSchema, petSpeciesSchema } from "../src/pet";
import { ROLE_NAMES, roleNameSchema } from "../src/role";
import { profileKindSchema, userStatusSchema } from "../src/user";

describe("enums de domínio", () => {
  it("registra em DOMAIN_ENUMS todo enum que tem dois donos, pelo nome do enum do Prisma", () => {
    // É este registro que o teste de paridade da API percorre: um enum novo no
    // contrato que não entrar aqui não é comparado com o Prisma.
    expect(DOMAIN_ENUMS).toEqual({
      ProfileKind: profileKindSchema,
      UserStatus: userStatusSchema,
      PetSpecies: petSpeciesSchema,
      PetSex: petSexSchema,
      ProductStatus: productStatusSchema,
    });

    for (const schema of Object.values(DOMAIN_ENUMS)) {
      expect(schema).toBeInstanceOf(z.ZodEnum);
      expect(schema.options.length).toBeGreaterThan(0);
    }
  });
});

describe("nomes de role e feature", () => {
  it("expõe os nomes como tupla `as const` e como z.enum sobre a mesma tupla", () => {
    expect(roleNameSchema.options).toEqual([...ROLE_NAMES]);
    expect(ROLE_NAMES).toContain("admin");
    expect(ROLE_NAMES).toContain("customer");
    expect(FEATURE_NAMES).toContain("*");
    expect(FEATURE_NAMES).toContain("manage:permission");
  });

  it("restringe PRIVILEGED_FEATURES a features declaradas", () => {
    const declared = new Set<string>(FEATURE_NAMES);
    for (const feature of PRIVILEGED_FEATURES) {
      expect(declared.has(feature)).toBe(true);
    }
  });
});
