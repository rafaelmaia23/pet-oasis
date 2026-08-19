import { z } from "zod";
import { PetSpecies, ProductStatus } from "@/generated/prisma/enums";
import { brandViews } from "@/modules/brand/brand.presenter";
import { tagViews } from "@/modules/tag/tag.presenter";
import { createPresenter } from "@/utils/presenter";

/**
 * Duas views de staff, escolhidas por `read:product:cost` (9.1): custo é dado
 * que o gerente delega, e a whitelist do Zod é o que garante que ele não
 * escape por descuido — `.parse()` derruba o campo que a view não lista.
 *
 * A view **pública** (sem custo, sem estoque exato, com disponibilidade
 * derivada) é da 9.8, junto das rotas de leitura: aqui só existe resposta de
 * escrita, e escrever exige `manage:product`.
 */

// Resumo da categoria: sem `children`, diferente da view de `GET /categories`.
// Produto vincula a qualquer nó da árvore (9.6/W2), e arrastar a subárvore
// inteira dentro de cada produto inflaria a resposta sem servir a ninguém.
const categorySummaryView = z
  .object({
    id: z.uuid(),
    name: z.string().meta({ example: "Ração seca" }),
    slug: z.string().meta({ example: "racao-seca" }),
    parentId: z.uuid().nullable(),
  })
  .meta({
    id: "CategorySummary",
    description: "Categoria vinculada ao produto, sem as filhas",
  });

const variantBaseShape = {
  id: z.uuid(),
  sku: z.string().meta({ example: "GOLDEN-AD-15KG" }),
  label: z.string().meta({ example: "15 kg" }),
  priceCents: z.int().meta({ example: 24990 }),
  compareAtPriceCents: z.int().nullable(),
  stockQuantity: z.int().meta({ example: 12 }),
  weightGrams: z.int().nullable(),
  volumeMl: z.int().nullable(),
  sizeLabel: z.string().nullable(),
  barcode: z.string().nullable(),
  isDefault: z.boolean(),
};

const variantInternalView = z.object(variantBaseShape).meta({
  id: "ProductVariantInternal",
  description: "Variante na visão de funcionário, sem o custo",
});

const variantCostView = z
  .object({ ...variantBaseShape, costCents: z.int().nullable() })
  .meta({
    id: "ProductVariantWithCost",
    description: "Variante com o custo — exige read:product:cost",
  });

const productShape = {
  id: z.uuid(),
  name: z.string().meta({ example: "Ração Golden Adulto" }),
  slug: z.string().meta({ example: "racao-golden-adulto" }),
  description: z.string(),
  status: z.enum(ProductStatus).meta({ example: ProductStatus.DRAFT }),
  targetSpecies: z.array(z.enum(PetSpecies)),
  brand: brandViews.default,
  categories: z.array(categorySummaryView),
  tags: z.array(tagViews.default),
};

const internalView = z
  .object({ ...productShape, variants: z.array(variantInternalView) })
  .meta({
    id: "ProductInternal",
    description: "Produto na visão de funcionário, sem o custo das variantes",
  });

const costView = z
  .object({ ...productShape, variants: z.array(variantCostView) })
  .meta({
    id: "ProductWithCost",
    description: "Produto com o custo das variantes — exige read:product:cost",
  });

export const productViews = {
  internal: internalView,
  cost: costView,
} as const;

export type ProductView = keyof typeof productViews;

export const productPresenter = createPresenter(productViews);

export const variantViews = {
  internal: variantInternalView,
  cost: variantCostView,
} as const;

export type VariantView = keyof typeof variantViews;

export const variantPresenter = createPresenter(variantViews);
