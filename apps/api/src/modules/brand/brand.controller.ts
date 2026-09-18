import type { Request, Response } from "express";
import { listEnvelope } from "@/lib/pagination";
import { uploadedFile } from "@/middlewares/upload.middleware";
import { brandPresenter } from "./brand.presenter";
import {
  brandParamsSchema,
  createBrandSchema,
  updateBrandSchema,
} from "./brand.schema";
import * as brandService from "./brand.service";

export const listBrands = async (_req: Request, res: Response) => {
  const brands = await brandService.getBrands();

  // Sem paginação (9.6/W7): conjunto pequeno e estável, mesma classe de
  // `GET /breeds`. O envelope existe mesmo assim para que paginar amanhã seja
  // aditivo, não breaking.
  res
    .status(200)
    .json(listEnvelope(brandPresenter.presentMany(brands, "default")));
};

export const createBrand = async (req: Request, res: Response) => {
  const { body } = createBrandSchema.parse({ body: req.body });

  const brand = await brandService.createBrand(body);

  return res.status(201).json(brandPresenter.present(brand, "default"));
};

export const updateBrand = async (req: Request, res: Response) => {
  const { params, body } = updateBrandSchema.parse({
    params: req.params,
    body: req.body,
  });

  const brand = await brandService.updateBrand(params.brandId, body);

  return res.status(200).json(brandPresenter.present(brand, "default"));
};

export const updateBrandLogo = async (req: Request, res: Response) => {
  const { params } = brandParamsSchema.parse({ params: req.params });

  const brand = await brandService.setBrandLogo(
    params.brandId,
    uploadedFile(req),
  );

  return res.status(200).json(brandPresenter.present(brand, "default"));
};

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
