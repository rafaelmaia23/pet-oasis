import { describe, expect, it } from "vitest";
import { featureViews, roleViews } from "../src";
import { meViews } from "../src/me";
import { userFeatureViews } from "../src/permission";
import { effectiveFeaturesViews } from "../src/permission/permission.views";
import { userViews } from "../src/user";

/**
 * Nome de feature que atravessa a rede é o enum do catálogo, nunca string
 * solta. O catálogo é fixo no código (não há rota que crie feature) e o seed é
 * chaveado por `FeatureName`, então estreitar não fecha porta nenhuma — e abre
 * autocomplete e checagem no cliente, que é onde a escolha se paga: é o web que
 * decide esconder afordância por nome de feature.
 */

const UUID = "00000000-0000-4000-8000-000000000000";

/** O erro que o enum existe para pegar: um `read:pet` digitado errado. */
const TYPO = "raed:pet";

const VALID = "read:pet";

/** O admin: precisa continuar passando, senão quem pode tudo não vê nada. */
const WILDCARD = "*";

const me = (features: string[]) => ({
  id: UUID,
  name: "Maria Silva",
  email: "maria@example.com",
  pendingEmail: null,
  cpf: "12345678901",
  customer: null,
  employee: null,
  features,
});

const userAdmin = (featureName: string) => ({
  id: UUID,
  name: "Maria Silva",
  email: "maria@example.com",
  pendingEmail: null,
  cpf: "12345678901",
  customer: null,
  employee: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  roles: [
    {
      role: { id: UUID, name: "manager" },
      features: [
        {
          granted: true,
          grantedAt: new Date(),
          feature: { id: UUID, name: featureName },
        },
      ],
    },
  ],
});

const userFeature = (featureName: string) => ({
  granted: true,
  grantedAt: new Date(),
  updatedAt: new Date(),
  role: { id: UUID, name: "manager" },
  feature: { id: UUID, name: featureName, description: "Ver os pets" },
});

const role = (featureName: string) => ({
  id: UUID,
  name: "manager",
  description: "Gerente da loja",
  appliesTo: "EMPLOYEE",
  features: [{ id: UUID, name: featureName, description: "Ver os pets" }],
});

const feature = (featureName: string) => ({
  id: UUID,
  name: featureName,
  description: "Ver os pets",
});

const cases = [
  {
    view: "me",
    schema: meViews.default,
    ok: me([VALID]),
    wildcard: me([WILDCARD]),
    bad: me([TYPO]),
  },
  {
    view: "effectiveFeatures",
    schema: effectiveFeaturesViews.default,
    ok: [VALID],
    wildcard: [WILDCARD],
    bad: [TYPO],
  },
  {
    view: "userFeature (override)",
    schema: userFeatureViews.default,
    ok: userFeature(VALID),
    wildcard: userFeature(WILDCARD),
    bad: userFeature(TYPO),
  },
  {
    view: "user (admin)",
    schema: userViews.admin,
    ok: userAdmin(VALID),
    wildcard: userAdmin(WILDCARD),
    bad: userAdmin(TYPO),
  },
  {
    view: "role",
    schema: roleViews.default,
    ok: role(VALID),
    wildcard: role(WILDCARD),
    bad: role(TYPO),
  },
  {
    view: "feature",
    schema: featureViews.default,
    ok: feature(VALID),
    wildcard: feature(WILDCARD),
    bad: feature(TYPO),
  },
] as const;

describe("nome de feature nas views", () => {
  for (const { view, schema, ok, wildcard, bad } of cases) {
    it(`${view}: aceita nome do catálogo`, () => {
      expect(schema.safeParse(ok).success).toBe(true);
    });

    it(`${view}: aceita o wildcard \`*\``, () => {
      expect(schema.safeParse(wildcard).success).toBe(true);
    });

    it(`${view}: recusa nome fora do catálogo`, () => {
      expect(schema.safeParse(bad).success).toBe(false);
    });
  }
});
