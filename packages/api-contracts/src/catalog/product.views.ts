import { z } from "zod";
import { offsetMetaSchema } from "../pagination/pagination.schema";
import { petSpeciesSchema } from "../pet/pet.enums";
import { brandViews } from "./brand.views";
import { productStatusSchema } from "./catalog.enums";
import { tagViews } from "./tag.views";

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

/**
 * Imagem do produto (9.10). Nem `path` nem qualquer caminho de disco aparecem:
 * o banco guarda a **chave**, e o que sai na API são as duas URLs públicas,
 * montadas no service a partir de `UPLOAD_PUBLIC_BASE_URL`. Vazar a chave
 * amarraria o cliente ao layout do disco, que é justamente o que a AA2 quer
 * manter livre para trocar quem serve o byte.
 */
const productImageView = z
  .object({
    id: z.uuid(),
    position: z.int().meta({ description: "0 é a capa", example: 0 }),
    fullUrl: z.url(),
    thumbUrl: z.url(),
  })
  .meta({
    id: "ProductImage",
    description: "Imagem do produto, nos dois tamanhos",
  });

// A capa, sem `id` e sem `position`: na lista não há o que fazer com nenhum dos
// dois — reordenar e apagar acontecem no detalhe.
const productCoverView = z
  .object({ fullUrl: z.url(), thumbUrl: z.url() })
  .meta({
    id: "ProductCover",
    description: "Imagem de capa (posição 0) do produto",
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
  targetSpecies: z.array(petSpeciesSchema),
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
  status: productStatusSchema.meta({ example: "DRAFT" }),
};

/**
 * Detalhe e lista divergem em **um** campo (9.10/AA14): o detalhe traz o array
 * ordenado de imagens, a lista traz só a capa. Vinte produtos × oito imagens é
 * payload que nenhuma vitrine usa, e a capa é tudo de que um card precisa.
 *
 * As duas famílias têm as mesmas três chaves (`public`/`internal`/`cost`), então
 * `readViewFor` continua escolhendo uma vez só e serve às duas — a escada de
 * feature efetiva e a diferença lista×detalhe são eixos independentes, e é de
 * propósito que não se cruzem num nome composto.
 *
 * O service produz **os dois** campos (`images` e `image`) em toda resposta; a
 * whitelist do Zod derruba o que a view não lista. Um caminho de código só, e a
 * view decide o que sai.
 */
const detailView = <Shape extends z.ZodRawShape, Variant extends z.ZodType>(
  shape: Shape,
  variant: Variant,
  meta: { id: string; description: string },
) =>
  z
    .object({
      ...shape,
      images: z.array(productImageView),
      variants: z.array(variant),
    })
    .meta(meta);

const listView = <Shape extends z.ZodRawShape, Variant extends z.ZodType>(
  shape: Shape,
  variant: Variant,
  meta: { id: string; description: string },
) =>
  z
    .object({
      ...shape,
      image: productCoverView.nullable(),
      variants: z.array(variant),
    })
    .meta(meta);

const publicView = detailView(productPublicShape, variantPublicView, {
  id: "ProductPublic",
  description:
    "Produto na vitrine: sem custo, sem estoque exato e sem status — a view de quem não tem read:product:internal, inclusive o visitante anônimo",
});

const internalView = detailView(productShape, variantInternalView, {
  id: "ProductInternal",
  description: "Produto na visão de funcionário, sem o custo das variantes",
});

const costView = detailView(productShape, variantCostView, {
  id: "ProductWithCost",
  description: "Produto com o custo das variantes — exige read:product:cost",
});

const publicListView = listView(productPublicShape, variantPublicView, {
  id: "ProductListPublic",
  description: "Produto na listagem pública: imagens reduzidas à capa",
});

const internalListView = listView(productShape, variantInternalView, {
  id: "ProductListInternal",
  description: "Produto na listagem de funcionário, sem o custo das variantes",
});

const costListView = listView(productShape, variantCostView, {
  id: "ProductListWithCost",
  description: "Produto na listagem com o custo — exige read:product:cost",
});

export const productViews = {
  public: publicView,
  internal: internalView,
  cost: costView,
} as const;

export const productListViews = {
  public: publicListView,
  internal: internalListView,
  cost: costListView,
} as const;

export type ProductView = keyof typeof productViews;

export const variantViews = {
  public: variantPublicView,
  internal: variantInternalView,
  cost: variantCostView,
} as const;

export type VariantView = keyof typeof variantViews;

export const productImageViews = {
  default: productImageView,
} as const;

export type ProductImageView = keyof typeof productImageViews;

/**
 * A listagem de produtos ganha `meta.search` **só** quando veio `?q=` (9.9/Z15):
 * o eco do que foi digitado e do que de fato foi buscado depois da correção de
 * digitação. Fica numa meta própria, e não na `offsetMetaSchema` genérica, para
 * o campo não ser prometido em toda lista paginada do projeto.
 */
const searchMetaSchema = z
  .object({
    q: z.string().meta({ example: "racao golen" }),
    applied: z.string().meta({ example: "racao golden" }),
  })
  .meta({
    id: "ProductSearchMeta",
    description: "O que foi digitado e o que de fato foi buscado",
  });

export const productListMetaSchema = offsetMetaSchema
  .extend({ search: searchMetaSchema.optional() })
  .meta({
    id: "ProductListMeta",
    description: "Paginação por offset, mais o eco da busca quando há `?q=`",
  });

// A resposta da reordenação: a fila inteira, na ordem nova. Sem `meta` — não é
// listagem paginada, é o estado resultante de uma escrita.
export const productImageListSchema = z.object({
  data: z.array(productImageView),
});

/**
 * O envelope da vitrine. Não sai de `offsetList` porque o `meta` é o desta
 * listagem, com o eco da busca — e é justamente por isso que ele mora aqui, ao
 * lado das views, e não montado na entrada da tabela de rotas.
 *
 * **A listagem tem escada, apesar do custo de legibilidade no `/openapi.json`.**
 * A leitura original desta função dizia que a listagem "não tem escada": o
 * degrau seria escolhido uma vez para a página inteira, e uma união de três
 * envelopes esconderia o `meta` de quem lê a spec. Isso ficou desatualizado —
 * o controller sempre variou a view por item conforme a feature efetiva do
 * ator (9.8/Y9), e a issue 14 de `.scratch/fase-12-module-depth/` migrou a
 * rota para o registrador sem poder mudar esse comportamento. Como o
 * `chooseView` do registrador escolhe **um** schema por status a partir de uma
 * escada declarada na entrada da tabela, a escada teve de subir para o nível
 * do envelope inteiro — item por item continuaria escondendo a variação do
 * corpo do registrador. `productListSchemaFor` é o envelope parametrizado pela
 * view do item; `productListLadder` é a escada dos três, na mesma ordem de
 * `productReadLadder`.
 */
export const productListSchemaFor = (itemView: z.ZodType) =>
  z.object({
    data: z.array(itemView),
    meta: productListMetaSchema,
  });

export const productListLadder = [
  productListSchemaFor(publicListView),
  productListSchemaFor(internalListView),
  productListSchemaFor(costListView),
] as const;

/** Alias do primeiro degrau — mantido para quem ainda importa o envelope público sozinho. */
export const productListSchema = productListLadder[0];
