import { makeAuthUser } from "@tests/factories/user.factory";
import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/errors";
import {
  assertActorIsAdmin,
  can,
  canActOnResource,
  computeEffectiveFeatures,
  hasFeature,
  isAdmin,
} from "@/lib/authorization";
import type { FeatureName } from "@/modules/feature/feature.constants";

// Espelha o shape de `getUserForFeatureComputation` depois da Fase 8.0: o
// override não pendura no user solto, mora dentro da atribuição de role (D2).
type TestUser = {
  id: string;
  roles: {
    role: { name: string; features: { feature: { name: FeatureName } }[] };
    features: { granted: boolean; feature: { name: FeatureName } }[];
  }[];
};

describe("Authorization", () => {
  describe("hasFeature()", () => {
    it("should return true if the user has the feature", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = hasFeature(authUser, "read:user");

      expect(result).toBe(true);
    });

    it("should return false if the user does not have the feature", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = hasFeature(authUser, "manage:permission");

      expect(result).toBe(false);
    });

    it("should not match partial feature names", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = hasFeature(authUser, "read");

      expect(result).toBe(false);
    });

    it("should return true for wildcard features", () => {
      const admin = makeAuthUser(["*"]);
      expect(hasFeature(admin, "read:user")).toBe(true);
      expect(hasFeature(admin, "anything:feature")).toBe(true);
    });
  });

  describe("can()", () => {
    it("should return true if the user has the required feature", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = can(authUser, "read:user");

      expect(result).toBe(true);
    });

    it("should return true if the user has the required feature with :others suffix", () => {
      const authUser = makeAuthUser(["read:user:others"]);

      const result = can(authUser, "read:user");

      expect(result).toBe(true);
    });

    it("should not grant access based on unrelated :others modifier", () => {
      const authUser = makeAuthUser(["delete:user:others"]);

      const result = can(authUser, "update:user");

      expect(result).toBe(false);
    });

    it("should return false if the user does not have the required feature", () => {
      const authUser = makeAuthUser(["update:user"]);

      const result = can(authUser, "delete:user");

      expect(result).toBe(false);
    });

    it("should return true for wildcard features", () => {
      const authUser = makeAuthUser(["*"]);

      expect(can(authUser, "read:permission")).toBe(true);

      expect(can(authUser, "any:feature")).toBe(true);
    });
  });

  describe("canActOnResource()", () => {
    it("should return true if the user has the required feature with :others suffix", () => {
      const authUser = makeAuthUser(["read:user:others"]);

      expect(
        canActOnResource(
          authUser,
          "read:user",
          "615e3654-f291-4959-8a29-b5bf2675d7e8",
        ),
      ).toBe(true);

      expect(canActOnResource(authUser, "read:user", authUser.id)).toBe(true);
    });

    it("should return true if the user has the required feature and is the resource owner", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = canActOnResource(authUser, "read:user", authUser.id);

      expect(result).toBe(true);
    });

    it("should return false if the user has the required feature but is not the resource owner", () => {
      const authUser = makeAuthUser(["read:user"]);

      const result = canActOnResource(
        authUser,
        "read:user",
        "615e3654-f291-4959-8a29-b5bf2675d7e8",
      );

      expect(result).toBe(false);
    });

    it("should return false if the user does not have the required feature", () => {
      const authUser = makeAuthUser(["write:user"]);

      const result = canActOnResource(
        authUser,
        "read:user",
        "615e3654-f291-4959-8a29-b5bf2675d7e8",
      );

      expect(result).toBe(false);
    });

    it("should return false if the user does not have the required feature even if they are the resource owner", () => {
      const authUser = makeAuthUser(["write:user"]);

      const result = canActOnResource(authUser, "read:user", authUser.id);

      expect(result).toBe(false);
    });

    it("should return true for wildcard features", () => {
      const authUser = makeAuthUser(["*"]);

      expect(
        canActOnResource(
          authUser,
          "read:user",
          "615e3654-f291-4959-8a29-b5bf2675d7e8",
        ),
      ).toBe(true);

      expect(canActOnResource(authUser, "read:user", authUser.id)).toBe(true);

      expect(canActOnResource(authUser, "any:feature", "any-resource-id")).toBe(
        true,
      );
    });
  });

  describe("computeEffectiveFeatures()", () => {
    it("should return a empty set if the user has no features or roles", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(new Set());
    });

    it("should return a set of effective features for the user", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: {
              name: "attendant",
              features: [
                { feature: { name: "read:user" } },
                { feature: { name: "update:user" } },
                { feature: { name: "delete:user" } },
                { feature: { name: "read:session" } },
              ],
            },
            features: [
              { granted: true, feature: { name: "read:user:others" } },
            ],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(
        new Set([
          "read:user:others",
          "read:user",
          "update:user",
          "delete:user",
          "read:session",
        ]),
      );
    });

    it("should not include features that are explicitly denied", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: {
              name: "attendant",
              features: [
                { feature: { name: "read:user" } },
                { feature: { name: "update:user" } },
                { feature: { name: "delete:user" } },
                { feature: { name: "read:session" } },
              ],
            },
            features: [
              { granted: true, feature: { name: "read:user:others" } },
              { granted: false, feature: { name: "read:feature" } },
            ],
          },
          {
            role: {
              name: "manager",
              features: [
                { feature: { name: "create:user" } },
                { feature: { name: "read:user:others" } },
                { feature: { name: "update:user:others" } },
                { feature: { name: "delete:user:others" } },
                { feature: { name: "read:feature" } },
              ],
            },
            features: [],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(
        new Set([
          "read:user",
          "update:user",
          "delete:user",
          "read:session",
          "create:user",
          "read:user:others",
          "update:user:others",
          "delete:user:others",
        ]),
      );
    });

    // Trava a ordem: TODAS as features estáticas primeiro, TODOS os overrides
    // depois. Num laço só (role por role), este deny seria aplicado antes de a
    // role `manager` somar `read:feature`, e a feature sobreviveria.
    it("should apply every override after every role feature, whatever the role order", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: {
              name: "attendant",
              features: [{ feature: { name: "read:user" } }],
            },
            features: [{ granted: false, feature: { name: "read:feature" } }],
          },
          {
            role: {
              name: "manager",
              features: [{ feature: { name: "read:feature" } }],
            },
            features: [],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(new Set(["read:user"]));
    });

    it("should deduplicate features from multiple roles", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: {
              name: "attendant",
              features: [
                { feature: { name: "read:user" } },
                { feature: { name: "update:user" } },
                { feature: { name: "delete:user" } },
                { feature: { name: "read:session" } },
              ],
            },
            features: [],
          },
          {
            role: {
              name: "manager",
              features: [
                { feature: { name: "read:user" } },
                { feature: { name: "update:user" } },
                { feature: { name: "delete:user" } },
                { feature: { name: "read:session" } },
              ],
            },
            features: [],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(
        new Set(["read:user", "update:user", "delete:user", "read:session"]),
      );
    });

    it("should grant access of feature it explicitly granted even if no role grants it", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: {
              name: "attendant",
              features: [
                { feature: { name: "read:user" } },
                { feature: { name: "update:user" } },
                { feature: { name: "delete:user" } },
                { feature: { name: "read:session" } },
              ],
            },
            features: [{ granted: true, feature: { name: "read:feature" } }],
          },
          {
            role: {
              name: "manager",
              features: [
                { feature: { name: "create:user" } },
                { feature: { name: "read:user:others" } },
                { feature: { name: "update:user:others" } },
                { feature: { name: "delete:user:others" } },
              ],
            },
            features: [],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(
        new Set([
          "read:feature",
          "read:user",
          "update:user",
          "delete:user",
          "read:session",
          "create:user",
          "read:user:others",
          "update:user:others",
          "delete:user:others",
        ]),
      );
    });

    it("should return a set with the wildcard feature if the user has a wildcard feature", () => {
      const user: TestUser = {
        id: "615e3654-f291-4959-8a29-b5bf2675d7e8",
        roles: [
          {
            role: { name: "customer", features: [] },
            features: [{ granted: true, feature: { name: "*" } }],
          },
        ],
      };

      const result = computeEffectiveFeatures(user);

      expect(result).toEqual(new Set(["*"]));
    });
  });

  describe("isAdmin()", () => {
    it("should return true if the actor has the admin role", () => {
      const actor = { roles: [{ role: { name: "admin" } }] };

      expect(isAdmin(actor)).toBe(true);
    });

    it("should return false if the actor has other roles only", () => {
      const actor = {
        roles: [{ role: { name: "manager" } }, { role: { name: "customer" } }],
      };

      expect(isAdmin(actor)).toBe(false);
    });

    // O ator pode ter sido deletado entre a autenticação e a busca no guard.
    it("should return false for a missing actor", () => {
      expect(isAdmin(null)).toBe(false);
    });
  });

  describe("assertActorIsAdmin()", () => {
    const denial = {
      message: "Apenas administradores podem fazer isso",
      action: "Solicite a um administrador",
    };

    it("should not throw for an admin actor", () => {
      const actor = { roles: [{ role: { name: "admin" } }] };

      expect(() => assertActorIsAdmin(actor, denial)).not.toThrow();
    });

    it("should throw a 403 carrying the caller's message and action", () => {
      const actor = { roles: [{ role: { name: "manager" } }] };

      expect(() => assertActorIsAdmin(actor, denial)).toThrow(ForbiddenError);
      try {
        assertActorIsAdmin(actor, denial);
      } catch (error) {
        expect(error).toMatchObject({
          statusCode: 403,
          code: "FORBIDDEN",
          message: denial.message,
          action: denial.action,
        });
      }
    });

    it("should throw for a missing actor", () => {
      expect(() => assertActorIsAdmin(null, denial)).toThrow(ForbiddenError);
    });
  });
});
