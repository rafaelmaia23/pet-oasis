import type { routes } from "@pet-oasis/api-contracts/routes";
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

export const deleteBrandLogo: RouteHandler<
  typeof routes.brand.deleteLogo
> = async ({ params }) => {
  await brandService.removeBrandLogo(params.brandId);
};

export const deleteBrand: RouteHandler<typeof routes.brand.delete> = async ({
  params,
}) => {
  await brandService.deleteBrand(params.brandId);
};
