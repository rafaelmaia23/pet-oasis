import { z } from "zod";

// Roles são read-only via API (definidas em código, semeadas no banco); só o
// vínculo user↔role é gerenciável. Os **nomes** são contrato — é o que um
// cliente digita ao atribuir uma role e o que o schema de request valida. O
// que cada role carrega (descrição, features, a que perfil se aplica) é seed
// da API, não contrato: o cliente não decide poder por role, decide por
// feature efetiva, que vem de `GET /me`. A ordem é a do catálogo da API.
export const ROLE_NAMES = [
  "customer",
  "attendant",
  "stockist",
  "catalog-manager",
  "manager",
  "admin",
  "demo",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const roleNameSchema = z.enum(ROLE_NAMES);
