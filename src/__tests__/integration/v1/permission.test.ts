import { faker } from "@faker-js/faker";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import { buildEmployee } from "@/__tests__/factories/user.factory";
import { expectValidationError } from "@/__tests__/helpers/assertions";
import { loginAs } from "@/__tests__/helpers/auth";
import { clearDatabase } from "@/__tests__/helpers/database";
import app from "@/app";
import { createNotFoundError } from "@/errors/errorFactory";
import { prisma } from "@/lib/prisma";
import { getFeatureByName } from "@/modules/feature/feature.repository";
import { userFeatureViews } from "@/modules/permission/permission.presenter";
import { findUserById } from "@/modules/user/user.repository";

afterEach(async () => {
  await clearDatabase();
});

describe("GET /api/v1/users/:userId/features", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/v1/users/some-id/features");

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 403 if user without `read:permission` tries to access non-existent user's features", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "read:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get("/api/v1/users/non-valid-id/features")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${faker.string.uuid()}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and list the features of the user if the user has feature: `read:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .get(`/api/v1/users/${user.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(z.array(userFeatureViews.default));
  });

  it("should return 200 and features of another user if request has feature: `read:permission`", async () => {
    const user1 = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user1.email, user1.password);

    const response = await request(app)
      .get(`/api/v1/users/${user2.id}/features`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(z.array(userFeatureViews.default));
  });
});

describe("PUT /api/v1/users/:userId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app)
      .put("/api/v1/users/some-id/features/some-feature-id")
      .send({ granted: true });

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/non-valid-id/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if feature id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/non-valid-feature-id`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(422);

    expectValidationError(response, ["featureId"]);
  });

  it("should return 422 if granted is missing or not a boolean", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: "not-a-boolean" });

    expect(response.status).toBe(422);

    expectValidationError(response, ["granted"]);

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(response2.status).toBe(422);

    expectValidationError(response2, ["granted"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${faker.string.uuid()}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${faker.string.uuid()}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 200 and upsert the feature to another user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user2.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user2.id);

    expect(userInDb).not.toBeNull();

    expect(userInDb?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );

    const response2 = await request(app)
      .put(`/api/v1/users/${user2.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(200);

    expect(response2.body).toMatchView(userFeatureViews.default);

    const userInDb2 = await findUserById(user2.id);

    expect(userInDb2).not.toBeNull();

    expect(userInDb2?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: false,
        }),
      ]),
    );
  });

  it("should return 200 and upsert the feature self user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user.id);

    expect(userInDb?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(200);

    expect(response2.body).toMatchView(userFeatureViews.default);

    const userInDb2 = await findUserById(user.id);

    expect(userInDb2?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: false,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user tries to upsert a `PERMISSION_FEATURES` override from any user", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user2.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features de permissão",
      action: "Solicite a um administrador que faça essa alteração",
    });

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: false });

    expect(response2.status).toBe(403);

    expect(response2.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features de permissão",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });

  it("should return 200 if admin role user tries to upsert a `PERMISSION_FEATURES` override from another user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(admin.email, admin.password);

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    expect(response.body).toMatchView(userFeatureViews.default);

    const userInDb = await findUserById(user.id);

    expect(userInDb?.features).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
          granted: true,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user with `manage:permission` tries to upsert a `PERMISSION_FEATURES` override from any user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const adminToken = await loginAs(admin.email, admin.password);

    const userToken = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ granted: true });

    expect(response.status).toBe(200);

    const response2 = await request(app)
      .put(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({ granted: false });

    expect(response2.status).toBe(403);
  });
});

describe("DELETE /api/v1/users/:userId/features/:featureId", () => {
  it("should return 401 if no token is provided", async () => {
    const response = await request(app).delete(
      "/api/v1/users/some-id/features/some-feature-id",
    );

    expect(response.status).toBe(401);

    expect(response.body).toMatchObject({
      message: "Usuário não autenticado",
      code: "UNAUTHORIZED",
      action: "Faça login e tente novamente",
    });
  });

  it("should return 403 if user does not have feature: `manage:permission`", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/some-feature-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 403 if user without `manage:permission` tries to remove feature from a non-existent user", async () => {
    const user = await buildEmployee({
      roleNames: ["attendant"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/features/some-feature-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      message: "Você não tem permissão para acessar este recurso",
      code: "FORBIDDEN",
      action: `Verifique se você tem acesso a feature "manage:permission"`,
    });
  });

  it("should return 422 if user id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/non-valid-id/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["userId"]);
  });

  it("should return 422 if feature id is not a valid uuid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/non-valid-feature-id`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(422);

    expectValidationError(response, ["featureId"]);
  });

  it("should return 404 if user with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${faker.string.uuid()}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const response = await request(app)
      .delete(
        `/api/v1/users/${faker.string.uuid()}/features/${faker.string.uuid()}`,
      )
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Feature não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  });

  it("should return 404 if feature with given id does not exist in user's override features", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("delete:user");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);

    expect(response.body).toMatchObject({
      code: "NOT_FOUND",
      message: "Usuário não possui essa feature override",
      action: "Verifique as features do usuário",
    });
  });

  it("should return 204 and remove the feature override from the user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
      denies: ["read:user:others"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("read:user:others");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 204 and remove the feature from other user if request is valid", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
      denies: ["delete:user"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("delete:user");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user2.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 204 if admin role user tries to remove a override of `PERMISSION_FEATURES` from another user", async () => {
    const admin = await buildEmployee({
      roleNames: ["admin"],
    });

    const user = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["manage:permission"],
    });

    const token = await loginAs(admin.email, admin.password);

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);

    const userInDb = await findUserById(user.id);

    if (!userInDb) {
      throw createNotFoundError({
        message: "Usuário não encontrado",
      });
    }

    expect(userInDb.features).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: feature.id,
        }),
      ]),
    );
  });

  it("should return 403 if a non admin role user tries to remove a `PERMISSION_FEATURES` override from any user", async () => {
    const user = await buildEmployee({
      roleNames: ["manager"],
    });

    const user2 = await buildEmployee({
      roleNames: ["attendant"],
      grants: ["manage:permission"],
    });

    const token = await loginAs(user.email, user.password);

    const feature = await getFeatureByName("manage:permission");

    if (!feature) {
      throw createNotFoundError({
        message: "Feature não encontrada",
      });
    }

    const response = await request(app)
      .delete(`/api/v1/users/${user2.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(403);

    expect(response.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features de permissão",
      action: "Solicite a um administrador que faça essa alteração",
    });

    const response2 = await request(app)
      .delete(`/api/v1/users/${user.id}/features/${feature.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response2.status).toBe(403);

    expect(response2.body).toMatchObject({
      code: "FORBIDDEN",
      message: "Apenas administradores podem alterar features de permissão",
      action: "Solicite a um administrador que faça essa alteração",
    });
  });
});

// describe("Soft delete de overrides — efeito no cômputo", () => {
//   describe("Soft delete de overrides — regressão de cômputo", () => {
//     it("should make the feature return to role-based state after a deny override is soft-deleted", async () => {
//       // attendant tem read:user pela role. Damos um DENY explícito, depois removemos o deny.
//       // A feature deve VOLTAR (o deny soft-deletado não conta mais no cômputo).
//       const admin = await buildEmployee({ roleNames: ["admin"] });
//       const adminToken = await loginAs(admin.email, admin.password);

//       // user-alvo: attendant (tem read:user pela role attendant)
//       const target = await buildEmployee({ roleNames: ["attendant"] });
//       const feature = await getFeatureByName("read:user");
//       if (!feature) throw new Error("Feature read:user não encontrada no seed");

//       // 1. DENY explícito de read:user → feature deve sumir do efetivo
//       await request(app)
//         .put(`/api/v1/users/${target.id}/features/${feature.id}`)
//         .set("Authorization", `Bearer ${adminToken}`)
//         .send({ granted: false });

//       // confirma que o deny está ativo (a feature não está mais nas efetivas)
//       const targetToken = await loginAs(target.email, target.password);
//       const deniedResp = await request(app)
//         .get(`/api/v1/users/${target.id}`)
//         .set("Authorization", `Bearer ${targetToken}`);
//       // attendant SEM read:user (negado) não consegue ler o próprio user → 403
//       expect(deniedResp.status).toBe(403);

//       // 2. Remove o override (soft delete do deny)
//       const delResp = await request(app)
//         .delete(`/api/v1/users/${target.id}/features/${feature.id}`)
//         .set("Authorization", `Bearer ${adminToken}`);
//       expect(delResp.status).toBe(204);

//       // 3. A feature deve ter VOLTADO (deny soft-deletado não conta) → consegue ler de novo
//       const restoredToken = await loginAs(target.email, target.password);
//       const restoredResp = await request(app)
//         .get(`/api/v1/users/${target.id}`)
//         .set("Authorization", `Bearer ${restoredToken}`);
//       expect(restoredResp.status).toBe(200);

//       // confirma no banco: existe UserFeature deletado (histórico preservado)
//       const allOverrides = await prisma.userFeature.findMany({
//         where: { userId: target.id, featureId: feature.id },
//       });
//       expect(allOverrides.length).toBeGreaterThanOrEqual(1);
//       expect(allOverrides.some((uf) => uf.deletedAt !== null)).toBe(true);
//     });

//     it("should allow re-granting a feature after its override was soft-deleted (no unique clash, history kept)", async () => {
//       const admin = await buildEmployee({ roleNames: ["admin"] });
//       const adminToken = await loginAs(admin.email, admin.password);

//       const target = await buildEmployee({ roleNames: ["attendant"] });
//       const feature = await getFeatureByName("read:user:others");
//       if (!feature)
//         throw new Error("Feature read:user:others não encontrada no seed");

//       // 1. GRANT
//       const grant1 = await request(app)
//         .put(`/api/v1/users/${target.id}/features/${feature.id}`)
//         .set("Authorization", `Bearer ${adminToken}`)
//         .send({ granted: true });
//       expect(grant1.status).toBe(200);

//       // 2. DELETE (soft)
//       const del = await request(app)
//         .delete(`/api/v1/users/${target.id}/features/${feature.id}`)
//         .set("Authorization", `Bearer ${adminToken}`);
//       expect(del.status).toBe(204);

//       // 3. GRANT de novo — não deve dar unique clash; cria um override ativo novo
//       const grant2 = await request(app)
//         .put(`/api/v1/users/${target.id}/features/${feature.id}`)
//         .set("Authorization", `Bearer ${adminToken}`)
//         .send({ granted: true });
//       expect(grant2.status).toBe(200);

//       // banco: vários registros do mesmo par (histórico), mas só UM ativo
//       const overrides = await prisma.userFeature.findMany({
//         where: { userId: target.id, featureId: feature.id },
//       });
//       const ativos = overrides.filter((uf) => uf.deletedAt === null);
//       const deletados = overrides.filter((uf) => uf.deletedAt !== null);
//       expect(ativos.length).toBe(1); // exatamente um ativo
//       expect(deletados.length).toBeGreaterThanOrEqual(1); // histórico preservado
//     });
//   });
// });
