import { auditLogRoutes } from "./audit-log.routes";
import { authRoutes } from "./auth.routes";
import { brandRoutes } from "./brand.routes";
import { breedRoutes } from "./breed.routes";
import { categoryRoutes } from "./category.routes";
import { featureRoutes } from "./feature.routes";
import { logRoutes } from "./log.routes";
import { meRoutes } from "./me.routes";
import { permissionRoutes } from "./permission.routes";
import { petRoutes } from "./pet.routes";
import { productRoutes, variantRoutes } from "./product.routes";
import { profileRoutes } from "./profile.routes";
import { roleRoutes } from "./role.routes";
import type { RouteTable } from "./route.types";
import { statusRoutes } from "./status.routes";
import { tagRoutes } from "./tag.routes";
import { userRoutes } from "./user.routes";

export * from "./responses";
export * from "./route.types";

/**
 * A tabela de rotas: **a** fonte dos endpoints da API. Um cliente chama
 * qualquer um deles sem escrever um path à mão —
 * `routes.<domínio>.<operação>` dá o método, o path (na forma do Express,
 * `/users/:id`), o schema de request, a resposta por status, o shape de erro
 * por status, se a rota é pública ou exige bearer, e a prosa que explica o
 * caso.
 *
 * A ordem dos domínios aqui é a ordem em que os paths saem no `/openapi.json`.
 */
export const routes = {
  status: statusRoutes,
  auth: authRoutes,
  me: meRoutes,
  user: userRoutes,
  profile: profileRoutes,
  permission: permissionRoutes,
  role: roleRoutes,
  feature: featureRoutes,
  breed: breedRoutes,
  brand: brandRoutes,
  category: categoryRoutes,
  tag: tagRoutes,
  product: productRoutes,
  variant: variantRoutes,
  pet: petRoutes,
  auditLog: auditLogRoutes,
  log: logRoutes,
} as const satisfies RouteTable;
