import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ROLES } from "@/modules/role/role.constants";

/**
 * O seed roda uma vez no `globalSetup`. Este teste prova que o que está
 * declarado em `role.constants.ts` chegou ao banco — em particular as roles
 * novas da 9.1 (`stockist`, `catalog-manager`), que não existiam antes e cuja
 * ausência só apareceria como 403 misterioso lá na 9.7.
 */
describe("seed do catálogo RBAC", () => {
  it("semeia toda role de DEFAULT_ROLES com exatamente as features declaradas", async () => {
    const seeded = await prisma.role.findMany({
      include: { features: { include: { feature: true } } },
    });

    const seededByName = new Map(seeded.map((role) => [role.name, role]));

    expect(seeded).toHaveLength(DEFAULT_ROLES.length);

    for (const expected of DEFAULT_ROLES) {
      const role = seededByName.get(expected.name);

      expect(role, `role "${expected.name}" não foi semeada`).toBeDefined();
      expect(role?.appliesTo).toBe(expected.appliesTo);

      const featureNames = (role?.features ?? [])
        .map((link) => link.feature.name)
        .sort();

      expect(featureNames).toEqual([...expected.features].sort());
    }
  });
});
