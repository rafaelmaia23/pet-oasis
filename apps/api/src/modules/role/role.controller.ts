import { roleParamsSchema } from "@pet-oasis/api-contracts/role";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import { rolePresenter } from "./role.presenter";
import * as roleService from "./role.service";

export const getAllRoles: RouteHandler<typeof routes.role.list> = async () => {
  // Sem paginação: catálogo de referência limitado (docs/adr/0004-pagination.md).
  // O envelope existe mesmo assim para que ganhar paginação amanhã seja aditivo.
  const roles = await roleService.getAllRoles();

  return listEnvelope(roles);
};

export const getRoleById = async (req: Request, res: Response) => {
  const { params } = roleParamsSchema.parse({ params: req.params });

  const role = await roleService.getRoleById(params.id);

  return res.status(200).json(rolePresenter.present(role, "default"));
};
