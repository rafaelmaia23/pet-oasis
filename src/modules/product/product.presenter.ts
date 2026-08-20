import { z } from "zod";
import { PetSpecies, ProductStatus } from "@/generated/prisma/enums";
import { brandViews } from "@/modules/brand/brand.presenter";
import { tagViews } from "@/modules/tag/tag.presenter";
import { createPresenter } from "@/utils/presenter";

/**
 * Três views em **escada**, cada degrau contendo o anterior (9.8/Y9):
 *
 * | view       | destravada por          | acrescenta                        |
 * |------------|-------------------------|-----------------------------------|
 * | `public`   | ninguém (inclui anônimo)| preço, marca, taxonomia, `inStock`|
 * | `internal` | `read:product:internal` | `stockQuantity` exato e `status`  |
 * | `cost`     | `read:product:cost`     | `costCents`                       |
 *
 * `read:product:cost` **implica** a visão interna: quem vê margem vê estoque e
 * rascunho. Por isso a escada tem três degraus e não uma matriz 2×2.
 *
 * A whitelist do Zod é o corte de verdade — `.parse()` derruba o campo que a
 * view não lista, então custo e quantidade não escapam nem por descuido do
 * service. `inStock` é derivado e entra nas três (Y10): saber se tem estoque
 * não deveria obrigar ninguém a ramificar por view.
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

// Degrau público da variante: preço e características, sem quantidade. Trocar a
// quantidade exata por um booleano é decisão consciente (§3.8 do contexto da
// fase) — estoque é informação competitiva e não muda nada para quem compra.
const variantPublicShape = {
  id: z.uuid(),
  sku: z.string().meta({ example: "GOLDEN-AD-15KG" }),
  label: z.string().meta({ example: "15 kg" }),
  priceCents: z.int().meta({ example: 24990 }),
  compareAtPriceCents: z.int().nullable(),
  inStock: z.boolean().meta({
    description: "Derivado de stockQuantity > 0",
    example: true,
  }),
  weightGrams: z.int().nullable(),
  volumeMl: z.int().nullable(),
  sizeLabel: z.string().nullable(),
  barcode: z.string().nullable(),
  isDefault: z.boolean(),
};

const variantBaseShape = {
  ...variantPublicShape,
  stockQuantity: z.int().meta({ example: 12 }),
};

const variantPublicView = z.object(variantPublicShape).meta({
  id: "ProductVariantPublic",
  description: "Variante na vitrine: sem custo e sem a quantidade exata",
});

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

// `status` acompanha o estoque exato, e não o custo: quem destrava DRAFT e
// DISCONTINUED na listagem é `read:product:internal` (9.1). Para o público o
// campo seria constante — só produto ACTIVE o alcança (Y8) —, e devolvê-lo
// convidaria o cliente a ramificar por um valor que nunca varia.
const productPublicShape = {
  id: z.uuid(),
  name: z.string().meta({ example: "Ração Golden Adulto" }),
  slug: z.string().meta({ example: "racao-golden-adulto" }),
  description: z.string(),
  targetSpecies: z.array(z.enum(PetSpecies)),
  inStock: z.boolean().meta({
    description: "Verdadeiro quando alguma variante ativa tem estoque",
    example: true,
  }),
  brand: brandViews.default,
  categories: z.array(categorySummaryView),
  tags: z.array(tagViews.default),
};

const productShape = {
  ...productPublicShape,
  status: z.enum(ProductStatus).meta({ example: ProductStatus.DRAFT }),
};

const publicView = z
  .object({ ...productPublicShape, variants: z.array(variantPublicView) })
  .meta({
    id: "ProductPublic",
    description:
      "Produto na vitrine: sem custo, sem estoque exato e sem status — a view de quem não tem read:product:internal, inclusive o visitante anônimo",
  });

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
  public: publicView,
  internal: internalView,
  cost: costView,
} as const;

export type ProductView = keyof typeof productViews;

export const variantViews = {
  public: variantPublicView,
  internal: variantInternalView,
  cost: variantCostView,
} as const;

export type VariantView = keyof typeof variantViews;

export const productPresenter = createPresenter(productViews);

export const variantPresenter = createPresenter(variantViews);
