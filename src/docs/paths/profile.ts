import type { ZodOpenApiPathsObject } from "zod-openapi";
import {
  createCustomerProfileSchema,
  createEmployeeProfileSchema,
  deleteCustomerProfileSchema,
  deleteEmployeeProfileSchema,
} from "@/modules/user/profile/user.profile.schema";
import { userViews } from "@/modules/user/user.presenter";
import { errorResponses, jsonResponse, noContentResponse } from "../components";
import { fromEnvelope } from "../helpers";

const profileErrorResponses = {
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
  409: errorResponses[409],
};

export const profilePaths: ZodOpenApiPathsObject = {
  "/users/{userId}/customer": {
    post: {
      tags: ["Profiles"],
      summary: "Adiciona o perfil customer a um usuário — exige create:profile",
      ...fromEnvelope(createCustomerProfileSchema),
      responses: {
        201: jsonResponse("Perfil criado", userViews.owner),
        ...profileErrorResponses,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Profiles"],
      summary: "Remove (soft delete) o perfil customer — exige delete:profile",
      ...fromEnvelope(deleteCustomerProfileSchema),
      responses: { 204: noContentResponse, ...profileErrorResponses },
    },
  },
  "/users/{userId}/employee": {
    post: {
      tags: ["Profiles"],
      summary: "Adiciona o perfil employee a um usuário — exige create:profile",
      ...fromEnvelope(createEmployeeProfileSchema),
      responses: {
        201: jsonResponse("Perfil criado", userViews.owner),
        ...profileErrorResponses,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Profiles"],
      summary: "Remove (soft delete) o perfil employee — exige delete:profile",
      ...fromEnvelope(deleteEmployeeProfileSchema),
      responses: { 204: noContentResponse, ...profileErrorResponses },
    },
  },
};
