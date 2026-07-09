/// <reference types="zod-openapi" />
import { createDocument, type ZodOpenApiObject } from "zod-openapi";
import { securitySchemes } from "./components";
import { authPaths } from "./paths/auth";
import { featurePaths } from "./paths/feature";
import { mePaths } from "./paths/me";
import { permissionPaths } from "./paths/permission";
import { profilePaths } from "./paths/profile";
import { rolePaths } from "./paths/role";
import { statusPaths } from "./paths/status";
import { userPaths } from "./paths/user";

type OpenApiDocument = ReturnType<typeof createDocument>;

const documentDefinition: ZodOpenApiObject = {
  openapi: "3.1.0",
  info: {
    title: "Pet Oasis API",
    version: "1.0.0",
    description:
      "API REST de um pet shop online — autenticação (access JWT + refresh " +
      "opaco rotativo), autorização RBAC com overrides, usuários e perfis. " +
      "Documento gerado a partir dos próprios schemas Zod.",
  },
  servers: [{ url: "/api/v1", description: "API v1" }],
  tags: [
    { name: "Status", description: "Saúde da aplicação" },
    { name: "Auth", description: "Autenticação e sessões" },
    { name: "Me", description: "Recursos do próprio usuário autenticado" },
    { name: "Users", description: "CRUD de usuários e banimento" },
    {
      name: "Profiles",
      description: "Perfis (customer/employee) de um usuário",
    },
    {
      name: "Permissions",
      description: "Roles e overrides de feature de um usuário",
    },
    { name: "Roles", description: "Catálogo de papéis (read-only)" },
    { name: "Features", description: "Catálogo de features (read-only)" },
  ],
  components: { securitySchemes },
  // Bearer por padrão; operações públicas sobrescrevem com `security: []`.
  security: [{ bearerAuth: [] }],
  paths: {
    ...statusPaths,
    ...authPaths,
    ...mePaths,
    ...userPaths,
    ...profilePaths,
    ...permissionPaths,
    ...rolePaths,
    ...featurePaths,
  },
};

let cachedDocument: OpenApiDocument | undefined;

export function buildOpenApiDocument(): OpenApiDocument {
  if (!cachedDocument) {
    cachedDocument = createDocument(documentDefinition);
  }
  return cachedDocument;
}
