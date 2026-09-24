import type { routes } from "@pet-oasis/api-contracts/routes";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as roleService from "./role.service";

export const getAllRoles: RouteHandler<typeof routes.role.list> = async () => {
  // Sem paginação: catálogo de referência limitado (docs/adr/0004-pagination.md).
  // O envelope existe mesmo assim para que ganhar paginação amanhã seja aditivo.
  const roles = await roleService.getAllRoles();

  return listEnvelope(roles);
};

export const getRoleById: RouteHandler<typeof routes.role.get> = async ({
  params,
}) => roleService.getRoleById(params.id);
