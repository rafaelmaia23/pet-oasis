import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as contract from "../src";
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

  it("não deixa `z.enum` exportado fora do registro sem declará-lo sem par no Prisma", () => {
    // Um enum novo exportado do índice e esquecido do registro passaria pela
    // paridade da API em silêncio. Aqui ele ou entra em DOMAIN_ENUMS, ou é
    // declarado explicitamente como enum que não tem par no Prisma (roles e
    // features são linhas, não enum; os `code` de erro só existem na API).
    const WITHOUT_PRISMA_PAIR = [
      "roleNameSchema",
      "featureNameSchema",
      "errorCodeSchema",
    ];
    const registered = new Set<unknown>(Object.values(DOMAIN_ENUMS));

    const unaccounted = Object.entries(contract)
      .filter(([, value]) => value instanceof z.ZodEnum)
      .filter(([, value]) => !registered.has(value))
      .map(([name]) => name)
      .filter((name) => !WITHOUT_PRISMA_PAIR.includes(name));

    expect(unaccounted).toEqual([]);
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
