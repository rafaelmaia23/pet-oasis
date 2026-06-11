import { describe, expect, it } from "vitest";
import { makeUserDataWithFeatures } from "@/__tests__/factories/user.factory";
import { type AuthUser, can, hasFeature } from "@/lib/authorization";

describe("Authorization", () => {
  describe("hasFeature()", () => {
    it("should return true if the user has the feature", () => {
      const user = makeUserDataWithFeatures(["read:user"]);

      const result = hasFeature(user, "read:user");

      expect(result).toBe(true);
    });

    it("should return false if the user does not have the feature", () => {
      const user = makeUserDataWithFeatures(["read:user"]);

      const result = hasFeature(user, "write:user");

      expect(result).toBe(false);
    });

    it("should return false if the user has no feature", () => {
      const user = makeUserDataWithFeatures([]);

      const result = hasFeature(user, "read:user");

      expect(result).toBe(false);
    });

    it("should not match partial feature names", () => {
      const user = makeUserDataWithFeatures(["read:user"]);

      const result = hasFeature(user, "read");

      expect(result).toBe(false);
    });

    it("should throw an error if user data is invalid", () => {
      const invalidUsers = [null, {}, { id: "123" }, { features: [] }];

      for (const invalidUser of invalidUsers) {
        expect(() =>
          hasFeature(invalidUser as unknown as AuthUser, "read:user"),
        ).toThrow("Invalid user data");
      }
    });
  });

  describe("can()", () => {
    it("should return true if the user has the required feature", () => {
      const user = makeUserDataWithFeatures(["manage:users"]);

      const result = can(user, "manage:users");

      expect(result).toBe(true);
    });

    it("should return true if the user has the required feature with :others suffix", () => {
      const user = makeUserDataWithFeatures(["manage:users:others"]);

      const result = can(user, "manage:users");

      expect(result).toBe(true);
    });

    it("should not grant access based on unrelated :others modifier", () => {
      const user = makeUserDataWithFeatures(["delete:user:others"]);
      const result = can(user, "update:user");
      expect(result).toBe(false);
    });

    it("should return false if the user does not have the required feature", () => {
      const user = makeUserDataWithFeatures(["manage:users"]);

      const result = can(user, "write:users");

      expect(result).toBe(false);
    });

    it("should return false if the user has no features", () => {
      const user = makeUserDataWithFeatures([]);
      const result = can(user, "manage:users");
      expect(result).toBe(false);
    });

    it("should throw an error if user data is invalid", () => {
      const invalidUsers = [null, {}, { id: "123" }, { features: [] }];

      for (const invalidUser of invalidUsers) {
        expect(() =>
          can(invalidUser as unknown as AuthUser, "manage:users"),
        ).toThrow("Invalid user data");
      }
    });
  });
});
