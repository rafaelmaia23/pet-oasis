import { z } from "zod";
import { createPresenter } from "@/utils/presenter";

/**
 * View única: taxonomia não tem campo sensível nem ramo por capability — marca,
 * categoria e tag aparecem inteiras na view **pública** do produto (ADR
 * product-catalog-modeling). Quem tem corte por capability é `Product` (9.8),
 * por causa de custo e estoque.
 */
const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Ração Golden" }),
    slug: z.string().meta({ example: "racao-golden" }),
    description: z.string().nullable(),
    logoPath: z.string().nullable(),
  })
  .meta({
    id: "Brand",
    description: "Marca de produto do catálogo",
  });

export const brandViews = {
  default: defaultView,
} as const;

export type BrandView = keyof typeof brandViews;

export const brandPresenter = createPresenter(brandViews);
