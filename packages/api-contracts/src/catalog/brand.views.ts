import { z } from "zod";

/**
 * View única: taxonomia não tem campo sensível nem ramo por feature efetiva — marca,
 * categoria e tag aparecem inteiras na view **pública** do produto (ADR
 * product-catalog-modeling). Quem tem corte por feature efetiva é `Product` (9.8),
 * por causa de custo e estoque.
 */
/**
 * O logo sai como as **duas URLs**, nunca como o `logoPath` gravado (9.10): o
 * valor no banco é a chave do storage, e devolvê-lo amarraria o cliente ao
 * layout do disco. Vale também aqui dentro do produto — esta view é reusada
 * como `brand` na view de produto, então a marca aparece igual nos dois.
 */
const brandLogoView = z
  .object({ fullUrl: z.url(), thumbUrl: z.url() })
  .meta({ id: "BrandLogo", description: "Logo da marca, nos dois tamanhos" });

const defaultView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Ração Golden" }),
    slug: z.string().meta({ example: "racao-golden" }),
    description: z.string().nullable(),
    logo: brandLogoView.nullable(),
  })
  .meta({
    id: "Brand",
    description: "Marca de produto do catálogo",
  });

export const brandViews = {
  default: defaultView,
} as const;

export type BrandView = keyof typeof brandViews;
