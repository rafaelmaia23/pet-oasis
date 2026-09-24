import { brandParamsSchema } from "@pet-oasis/api-contracts/catalog";
import type { routes } from "@pet-oasis/api-contracts/routes";
import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import type { RouteHandler } from "@/lib/registerRoute";
import * as brandService from "./brand.service";

export const listBrands: RouteHandler<typeof routes.brand.list> = async () => {
  // Sem paginação (9.6/W7): conjunto pequeno e estável, mesma classe de
  // `GET /breeds`. O envelope existe mesmo assim para que paginar amanhã seja
  // aditivo, não breaking.
  const brands = await brandService.getBrands();

  return listEnvelope(brands);
};

export const createBrand: RouteHandler<typeof routes.brand.create> = ({
  body,
}) => brandService.createBrand(body);

export const updateBrand: RouteHandler<typeof routes.brand.update> = ({
  params,
  body,
}) => brandService.updateBrand(params.brandId, body);

export const updateBrandLogo: RouteHandler<
  typeof routes.brand.setLogo,
  { file: Buffer }
> = ({ params, file }) => brandService.setBrandLogo(params.brandId, file);

export const deleteBrandLogo = async (req: Request, res: Response) => {
  const { params } = brandParamsSchema.parse({ params: req.params });

  await brandService.removeBrandLogo(params.brandId);

  return res.status(204).send();
};

export const deleteBrand = async (req: Request, res: Response) => {
  const { params } = brandParamsSchema.parse({ params: req.params });

  await brandService.deleteBrand(params.brandId);

  return res.status(204).send();
};
