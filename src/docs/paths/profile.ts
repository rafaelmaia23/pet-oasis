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
      summary: "Cria ou reativa o perfil customer de um usuário",
      description:
        "O ramo sai do estado do perfil no banco: ausente cria, soft-deletado " +
        "reativa, ativo responde 409. **201 nos dois ramos.** Exige " +
        "`create:customer-profile` ou `reactivate:customer-profile` — a versão " +
        "sem sufixo age sobre a própria conta (baseline de todo usuário " +
        "autenticado), a `:others` sobre a de terceiros (attendant, manager, " +
        "admin). Na reativação o `phone` enviado **atualiza** o perfil, e as " +
        "roles que morreram na cascata voltam; os overrides delas, não.",
      ...fromEnvelope(createCustomerProfileSchema),
      responses: {
        201: jsonResponse("Perfil criado ou reativado", userViews.owner),
        ...profileErrorResponses,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Profiles"],
      summary: "Remove (soft delete) o perfil customer — exige delete:profile",
      description:
        "Cascateia para as roles CUSTOMER e para os overrides pendurados nelas.",
      ...fromEnvelope(deleteCustomerProfileSchema),
      responses: { 204: noContentResponse, ...profileErrorResponses },
    },
  },
  "/users/{userId}/employee": {
    post: {
      tags: ["Profiles"],
      summary: "Cria ou reativa o perfil employee de um usuário",
      description:
        "O ramo sai do estado do perfil no banco: ausente cria, soft-deletado " +
        "reativa, ativo responde 409. **201 nos dois ramos.** Exige " +
        "`create:employee-profile` ou `reactivate:employee-profile` (manager " +
        "ou admin) — nunca há self-service para virar funcionário. O " +
        "`roleNames` é a lista de roles com que o perfil nasce **ou volta**: " +
        "cada nome é restaurado, se morreu naquela cascata, ou concedido, se " +
        "não; o que não for nomeado fica para trás. Omitido, volta tudo o que " +
        "morreu na cascata. Nomear uma role privilegiada sem ser admin → 403.",
      ...fromEnvelope(createEmployeeProfileSchema),
      responses: {
        201: jsonResponse("Perfil criado ou reativado", userViews.owner),
        ...profileErrorResponses,
        422: errorResponses[422],
      },
    },
    delete: {
      tags: ["Profiles"],
      summary: "Remove (soft delete) o perfil employee — exige delete:profile",
      description:
        "Cascateia para as roles EMPLOYEE e para os overrides pendurados nelas.",
      ...fromEnvelope(deleteEmployeeProfileSchema),
      responses: { 204: noContentResponse, ...profileErrorResponses },
    },
  },
};
