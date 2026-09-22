import {
  createCustomerProfileSchema,
  createEmployeeProfileSchema,
  deleteCustomerProfileSchema,
  deleteEmployeeProfileSchema,
} from "../user/user.profile.schema";
import { userViews } from "../user/user.views";
import { errorResponses, noContent } from "./responses";
import type { RouteGroup } from "./route.types";

// Mesma escada de `user`: a resposta é o usuário inteiro, na view que a
// feature efetiva de quem chamou destrava.
const userLadder = [userViews.owner, userViews.admin] as const;

const profileErrors = {
  401: errorResponses[401],
  403: errorResponses[403],
  404: errorResponses[404],
  409: errorResponses[409],
};

export const profileRoutes = {
  createCustomer: {
    method: "POST",
    path: "/users/:userId/customer",
    tag: "Profiles",
    auth: "bearer",
    summary: "Cria ou reativa o perfil customer de um usuário",
    description:
      "O ramo sai do estado do perfil no banco: ausente cria, soft-deletado " +
      "reativa, ativo responde 409. **201 nos dois ramos.** Exige " +
      "`create:customer-profile` ou `reactivate:customer-profile` — a versão " +
      "sem sufixo age sobre a própria conta (baseline de todo usuário " +
      "autenticado), a `:others` sobre a de terceiros (attendant, manager, " +
      "admin). Na reativação o `phone` enviado **atualiza** o perfil, e as " +
      "roles que morreram na cascata voltam; os overrides delas, não.",
    request: createCustomerProfileSchema,
    responses: {
      201: { description: "Perfil criado ou reativado", view: userLadder },
    },
    errors: { ...profileErrors, 422: errorResponses[422] },
  },
  deleteCustomer: {
    method: "DELETE",
    path: "/users/:userId/customer",
    tag: "Profiles",
    auth: "bearer",
    summary: "Remove (soft delete) o perfil customer — exige delete:profile",
    description:
      "Cascateia para as roles CUSTOMER e para os overrides pendurados nelas.",
    request: deleteCustomerProfileSchema,
    responses: { 204: noContent },
    errors: profileErrors,
  },
  createEmployee: {
    method: "POST",
    path: "/users/:userId/employee",
    tag: "Profiles",
    auth: "bearer",
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
    request: createEmployeeProfileSchema,
    responses: {
      201: { description: "Perfil criado ou reativado", view: userLadder },
    },
    errors: { ...profileErrors, 422: errorResponses[422] },
  },
  deleteEmployee: {
    method: "DELETE",
    path: "/users/:userId/employee",
    tag: "Profiles",
    auth: "bearer",
    summary: "Remove (soft delete) o perfil employee — exige delete:profile",
    description:
      "Cascateia para as roles EMPLOYEE e para os overrides pendurados nelas.",
    request: deleteEmployeeProfileSchema,
    responses: { 204: noContent },
    errors: profileErrors,
  },
} satisfies RouteGroup;
