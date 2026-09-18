import { describe, expect, it } from "vitest";
import { ProfileKind } from "@/generated/prisma/enums";
import {
  DEFAULT_FEATURES,
  type FeatureName,
} from "@/modules/feature/feature.constants";
import {
  DEFAULT_ROLES,
  PRIVILEGED_FEATURES,
  type RoleName,
} from "@/modules/role/role.constants";

const roleDefinition = (name: RoleName) => {
  const role = DEFAULT_ROLES.find((r) => r.name === name);

  if (!role) throw new Error(`Role "${name}" não está em DEFAULT_ROLES`);

  return role;
};

const featuresOf = (name: RoleName): readonly FeatureName[] =>
  roleDefinition(name).features;

// Toda feature que não é de leitura concede poder de escrita. Usado pelo guard
// da role `demo`, cuja credencial é pública.
const WRITE_VERB = /^(create|update|delete|manage|reactivate):/;

describe("catálogo de features", () => {
  it("não deixa feature órfã — toda feature declarada pertence a alguma role", () => {
    const granted = new Set<string>(DEFAULT_ROLES.flatMap((r) => r.features));

    const orphans = DEFAULT_FEATURES.map((f) => f.name).filter(
      (name) => !granted.has(name),
    );

    expect(orphans).toEqual([]);
  });

  it("mantém PRIVILEGED_FEATURES restrito à escalação do próprio sistema de permissão", () => {
    // D8 (9.1): custo/margem é segredo comercial, não escalação de privilégio —
    // o gerente delega visibilidade de custo sem precisar de admin.
    expect(PRIVILEGED_FEATURES).toEqual([
      "read:feature",
      "read:role",
      "read:permission",
      "manage:permission",
      "read:audit-log:full",
    ]);
  });
});

describe("features de pet (9.1)", () => {
  it("dá ao cliente o escopo próprio, e só ele", () => {
    const features = featuresOf("customer");

    expect(features).toContain("read:pet");
    expect(features).toContain("manage:pet");
    expect(features).not.toContain("read:pet:others");
    expect(features).not.toContain("manage:pet:others");
  });

  it("dá ao atendente o escopo `:others` — ele cadastra pet no nome do cliente", () => {
    const features = featuresOf("attendant");

    expect(features).toContain("read:pet:others");
    expect(features).toContain("manage:pet:others");
  });

  it("dá ao gerente o escopo `:others`", () => {
    const features = featuresOf("manager");

    expect(features).toContain("read:pet:others");
    expect(features).toContain("manage:pet:others");
  });
});

describe("features de catálogo (9.1)", () => {
  it("não dá feature de catálogo ao cliente — a vitrine é pública", () => {
    const features = featuresOf("customer");
    const catalogFeatures = features.filter(
      (f) =>
        f.includes("product") || f.includes("catalog") || f === "manage:stock",
    );

    expect(catalogFeatures).toEqual([]);
  });

  it("dá ao atendente a visão interna, sem custo e sem escrita", () => {
    const features = featuresOf("attendant");

    expect(features).toContain("read:product:internal");
    expect(features).not.toContain("read:product:cost");
    expect(features).not.toContain("manage:product");
    expect(features).not.toContain("manage:stock");
    expect(features).not.toContain("manage:catalog-structure");
  });

  it("dá ao repositor estoque e visão interna, sem autoria de catálogo nem custo", () => {
    const features = featuresOf("stockist");

    expect(features).toContain("manage:stock");
    expect(features).toContain("read:product:internal");
    expect(features).not.toContain("manage:product");
    expect(features).not.toContain("manage:catalog-structure");
    expect(features).not.toContain("read:product:cost");
    expect(roleDefinition("stockist").appliesTo).toBe(ProfileKind.EMPLOYEE);
  });

  it("dá ao gerente de catálogo a autoria completa, incluindo custo", () => {
    const features = featuresOf("catalog-manager");

    expect(features).toContain("manage:product");
    expect(features).toContain("manage:catalog-structure");
    expect(features).toContain("manage:stock");
    expect(features).toContain("read:product:internal");
    expect(features).toContain("read:product:cost");
    expect(roleDefinition("catalog-manager").appliesTo).toBe(
      ProfileKind.EMPLOYEE,
    );
  });

  it("não dá ao repositor nem ao gerente de catálogo poder sobre usuário", () => {
    for (const role of ["stockist", "catalog-manager"] as const) {
      const features = featuresOf(role);

      expect(features).not.toContain("read:user:others");
      expect(features).not.toContain("manage:user:status");
      expect(features).not.toContain("manage:permission");
    }
  });

  it("mantém o gerente como superconjunto do gerente de catálogo", () => {
    const managerFeatures = new Set<string>(featuresOf("manager"));
    const missing = featuresOf("catalog-manager").filter(
      (f) => !managerFeatures.has(f),
    );

    expect(missing).toEqual([]);
  });
});

describe("role `demo` (9.1)", () => {
  it("continua somente leitura depois das features novas", () => {
    const writeFeatures = featuresOf("demo").filter((f) => WRITE_VERB.test(f));

    expect(writeFeatures).toEqual([]);
  });

  it("enxerga o domínio novo — senão o demo público responde 403 na vitrine", () => {
    const features = featuresOf("demo");

    expect(features).toContain("read:pet:others");
    expect(features).toContain("read:product:internal");
  });

  it("não enxerga custo — o mascaramento é demonstrado dentro do payload", () => {
    // Mesmo desenho de `read:audit-log`/`read:audit-log:full`: o demo vê o
    // recurso e vê o campo sensível ausente.
    expect(featuresOf("demo")).not.toContain("read:product:cost");
  });
});
