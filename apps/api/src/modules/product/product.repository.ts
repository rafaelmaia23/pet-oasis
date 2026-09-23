import type { UpdateProductInput } from "@pet-oasis/api-contracts/catalog";
import type { Prisma } from "@/generated/prisma/client";
import type { PetSpecies } from "@/generated/prisma/enums";
import { ProductStatus } from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";

/**
 * Única camada que toca o Prisma no módulo. Toda leitura filtra
 * `deletedAt: null` — por isso `findFirst`, nunca `findUnique` —, e isso vale
 * também para a coleção de variantes: variante morta não acompanha o produto
 * vivo.
 */

const productInclude = {
  brand: true,
  categories: { include: { category: true } },
  tags: { include: { tag: true } },
  variants: {
    where: { deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  },
  // Sem `where` de `deletedAt`: imagem não tem soft delete, como a tag
  // (9.10/AA16) — a linha só existe enquanto o byte existe.
  //
  // O mesmo include serve à lista e ao detalhe, embora a lista só mostre a capa.
  // Um `take: 1` para a lista exigiria um segundo include atravessando os TRÊS
  // caminhos de leitura (normal, agregação de preço, ranking da busca) — e três
  // includes que precisam concordar é a classe de divergência que a Y8 e a Z4
  // fecharam. Oito linhas curtas por produto é o preço de não reabri-la.
  images: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof productInclude;
}>;

/** Cria as linhas das duas junções a partir dos ids já validados no service. */
const linkData = (categoryIds: string[], tagIds: string[]) => ({
  categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
  tags: { create: tagIds.map((tagId) => ({ tagId })) },
});

export async function findProductById(id: string) {
  return prisma.product.findFirst({
    where: { id, deletedAt: null },
    include: productInclude,
  });
}

export async function findProductBySlug(slug: string) {
  return prisma.product.findFirst({
    where: { slug, deletedAt: null },
    include: productInclude,
  });
}

export type ProductListFilters = {
  species?: PetSpecies | undefined;
  /** Já expandido em subárvore pelo service (9.6/W2). */
  categoryIds?: string[] | undefined;
  tagSlugs?: string[] | undefined;
  brandSlug?: string | undefined;
  minPriceCents?: number | undefined;
  maxPriceCents?: number | undefined;
  status?: ProductStatus | undefined;
  inStock?: boolean | undefined;
  /** Verdadeiro só para quem tem `read:product:internal` (9.8/Y1, Y8). */
  includeHidden?: boolean | undefined;
  /**
   * Ids que a busca textual devolveu, já ranqueados (9.9/Z4). A busca entra
   * como **filtro**, e não como um caminho paralelo: é o que garante que ela
   * enxergue exatamente o mesmo conjunto visível que a listagem e o detalhe.
   */
  ids?: string[] | undefined;
};

const activeVariant = {
  deletedAt: null,
} satisfies Prisma.ProductVariantWhereInput;

/**
 * Preço e disponibilidade numa cláusula `variants` só — as duas moram na mesma
 * chave, e emitidas em separado a segunda apagaria a primeira.
 *
 * Compostas, exigem a **mesma** variante: "até R$ 20 e em estoque" pergunta o
 * que dá para comprar, e o produto cuja variante barata está esgotada não
 * responde a isso, mesmo tendo outra disponível por trinta vezes o preço.
 *
 * `inStock=false` é a exceção e continua sendo do **produto**, não da variante:
 * significa "esgotado", e esgotado é não ter nenhuma variante em estoque. Com
 * faixa de preço junto, lê-se "tem algo nesta faixa e está todo esgotado".
 */
function buildVariantFilter(
  active: Prisma.ProductVariantWhereInput,
  priceRange: Prisma.IntFilter | undefined,
  inStock: boolean | undefined,
): Prisma.ProductWhereInput {
  const price = priceRange === undefined ? {} : { priceCents: priceRange };

  if (inStock === false) {
    return {
      variants: {
        ...(priceRange === undefined ? {} : { some: { ...active, ...price } }),
        none: { ...active, stockQuantity: { gt: 0 } },
      },
    };
  }

  const stock = inStock === undefined ? {} : { stockQuantity: { gt: 0 } };

  if (priceRange === undefined && inStock === undefined) return {};

  return { variants: { some: { ...active, ...price, ...stock } } };
}

/**
 * O recorte do que é visível, num lugar só. Listagem e detalhe compartilham
 * este `where` de propósito: se eles divergissem, um produto poderia sumir da
 * lista e continuar acessível pela URL — que é exatamente o vazamento que Y8
 * fecha. A busca da 9.9 é o terceiro caminho a entrar por aqui.
 */
export function buildProductWhere(
  filters: ProductListFilters,
): Prisma.ProductWhereInput {
  const {
    species,
    categoryIds,
    tagSlugs,
    brandSlug,
    minPriceCents,
    maxPriceCents,
    status,
    inStock,
    includeHidden,
    ids,
  } = filters;

  // A faixa de preço olha as **variantes**: o produto entra se alguma delas
  // couber, mesmo que a default esteja longe da faixa (§3.11 do contexto).
  const priceRange =
    minPriceCents === undefined && maxPriceCents === undefined
      ? undefined
      : {
          ...(minPriceCents === undefined ? {} : { gte: minPriceCents }),
          ...(maxPriceCents === undefined ? {} : { lte: maxPriceCents }),
        };

  return {
    deletedAt: null,
    // A busca é o terceiro caminho a entrar por aqui, como filtro — nunca pelo
    // `orderBy`. Lista vazia é resultado legítimo (nada casou), não "sem filtro".
    ...(ids === undefined ? {} : { id: { in: ids } }),
    // Sem a visão interna, DRAFT e DISCONTINUED não existem — e o filtro de
    // status já foi descartado pelo service antes de chegar aqui (Y1).
    ...(includeHidden
      ? status === undefined
        ? {}
        : { status }
      : { status: ProductStatus.ACTIVE }),
    // Vazio significa "qualquer espécie" (N7/Y5): o comedouro universal
    // aparece na seção de cães sem estar marcado como tal.
    ...(species === undefined
      ? {}
      : {
          OR: [
            { targetSpecies: { has: species } },
            { targetSpecies: { isEmpty: true } },
          ],
        }),
    ...(categoryIds === undefined
      ? {}
      : { categories: { some: { categoryId: { in: categoryIds } } } }),
    // Um `some` por tag, e não um `in`: interseção (Y6). Com `in`, ter
    // qualquer uma das tags bastaria, e marcar mais facetas aumentaria a lista.
    ...(tagSlugs === undefined || tagSlugs.length === 0
      ? {}
      : {
          AND: tagSlugs.map((slug) => ({ tags: { some: { tag: { slug } } } })),
        }),
    ...(brandSlug === undefined ? {} : { brand: { slug: brandSlug } }),
    // Preço e disponibilidade saem numa cláusula só, e não em duas: as duas
    // escreveriam a mesma chave `variants` no mesmo objeto, e a segunda
    // apagaria a primeira em silêncio. Compostas, exigem a **mesma** variante —
    // "até R$ 20 e em estoque" é pergunta sobre o que dá para comprar, e o
    // produto cuja variante barata está esgotada não responde a ela.
    ...buildVariantFilter(activeVariant, priceRange, inStock),
  };
}

/**
 * Listagem por preço (9.8/Y3) — o caminho de exceção.
 *
 * O Prisma só ordena por agregado de relação em `_count`, então "menor preço
 * entre as variantes ativas" não cabe num `orderBy` de produto. A saída é
 * agrupar as variantes, paginar **os ids** já ordenados e só então hidratar os
 * produtos: duas idas ao banco em vez de SQL cru, que o projeto reserva para a
 * busca textual.
 */
async function findProductsByPrice(
  where: Prisma.ProductWhereInput,
  pagination: { skip: number; take: number; order: "asc" | "desc" },
) {
  const groups = await prisma.productVariant.groupBy({
    by: ["productId"],
    where: { ...activeVariant, product: where },
    _min: { priceCents: true },
    // O tiebreaker por `productId` é obrigatório: sem ele, dois produtos com o
    // mesmo preço mínimo se repetem ou somem na borda da página.
    orderBy: [
      { _min: { priceCents: pagination.order } },
      { productId: pagination.order },
    ],
    skip: pagination.skip,
    take: pagination.take,
  });

  const ids = groups.map((group) => group.productId);

  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    include: productInclude,
  });

  // O `IN` do Postgres não preserva ordem — a ordenação verdadeira é a dos ids.
  const byId = new Map(rows.map((row) => [row.id, row]));

  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/**
 * Listagem por relevância (9.9/Z4) — o terceiro caminho.
 *
 * A ordem verdadeira é a dos ids que a busca devolveu, e o Postgres não a
 * preserva num `IN`. Então o recorte visível é resolvido primeiro (só os ids,
 * que é barato), a ordem do ranking é reimposta sobre o que sobrou, e só a
 * página é hidratada. O `total` sai daí **exato** — dentro do teto da busca.
 */
async function findProductsByRelevance(
  where: Prisma.ProductWhereInput,
  rankedIds: string[],
  pagination: { skip: number; take: number },
) {
  const visible = await prisma.product.findMany({
    where,
    select: { id: true },
  });
  const visibleIds = new Set(visible.map((product) => product.id));

  const ordered = rankedIds.filter((id) => visibleIds.has(id));
  const pageIds = ordered.slice(
    pagination.skip,
    pagination.skip + pagination.take,
  );

  const rows = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include: productInclude,
  });

  const byId = new Map(rows.map((row) => [row.id, row]));

  return {
    products: pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
    total: ordered.length,
  };
}

/**
 * `total` sai do `count` de produtos, e não do tamanho do agrupamento, porque
 * **todo produto ativo tem ≥1 variante ativa** (9.7/X3 + X6) — os dois conjuntos
 * são o mesmo, e o `count` custa menos.
 */
export async function findAllProducts(
  filters: ProductListFilters,
  // União, e não um `orderBy` com `priceOrder` opcional ao lado: `price` não é
  // coluna do produto, e um `orderBy: [{ price }]` que chegasse ao Prisma
  // explodiria em runtime. O tipo é o que impede o par inválido de existir.
  pagination: { skip: number; take: number } & (
    | { priceOrder: "asc" | "desc"; orderBy?: never; relevanceOrder?: never }
    | {
        relevanceOrder: string[];
        orderBy?: never;
        priceOrder?: never;
      }
    | {
        orderBy: Prisma.ProductOrderByWithRelationInput[];
        priceOrder?: never;
        relevanceOrder?: never;
      }
  ),
) {
  const where = buildProductWhere(filters);

  if (pagination.relevanceOrder) {
    return findProductsByRelevance(where, pagination.relevanceOrder, {
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  if (pagination.priceOrder) {
    const [products, total] = await Promise.all([
      findProductsByPrice(where, {
        skip: pagination.skip,
        take: pagination.take,
        order: pagination.priceOrder,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  }

  const [products, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: pagination.orderBy,
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

/**
 * Produto, variantes e vínculos numa transação só: o invariante "todo produto
 * tem ≥1 variante" (X3) nunca é observável violado, nem por um instante.
 */
export async function createProduct(
  data: Omit<Prisma.ProductUncheckedCreateInput, "id">,
  variants: Prisma.ProductVariantCreateWithoutProductInput[],
  links: { categoryIds: string[]; tagIds: string[] },
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        ...data,
        variants: { create: variants },
        ...linkData(links.categoryIds, links.tagIds),
      },
      include: productInclude,
    });

    if (audit) await record({ ...audit, targetId: product.id }, tx);

    return product;
  });
}

/**
 * Substituição total dos vínculos (X7): o conjunto enviado passa a ser o
 * conjunto, e o que não veio some. Junção é aresta, não filho com ciclo de vida
 * — por isso `deleteMany` de verdade, e não soft delete.
 */
export async function updateProduct(
  id: string,
  data: Omit<UpdateProductInput, "categories" | "tags">,
  links: { categoryIds?: string[]; tagIds?: string[] },
  audit?: AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    if (links.categoryIds) {
      await tx.productCategory.deleteMany({ where: { productId: id } });
      await tx.productCategory.createMany({
        data: links.categoryIds.map((categoryId) => ({
          productId: id,
          categoryId,
        })),
      });
    }

    if (links.tagIds) {
      await tx.productTag.deleteMany({ where: { productId: id } });
      await tx.productTag.createMany({
        data: links.tagIds.map((tagId) => ({ productId: id, tagId })),
      });
    }

    const product = await tx.product.update({
      where: { id, deletedAt: null },
      data: definedOnly(data),
      include: productInclude,
    });

    if (audit) await record(audit, tx);

    return product;
  });
}

/**
 * Soft delete com cascata nas variantes (X8), com **um único** `new Date()`
 * propagado para as duas tabelas — a mesma regra do grafo do usuário (D4):
 * nunca existe filho ativo de pai morto, e a igualdade do timestamp é o que
 * permitiria correlacionar a volta se um `restore` de produto existir um dia.
 *
 * O audit chega como *builder* porque a contagem só é conhecida dentro da
 * transação, no idioma de `softDeleteUserAndInvalidateSessions`.
 */
export async function softDeleteProduct(
  id: string,
  buildAudit?: (counts: { variants: number }) => AuditDescriptor,
) {
  return prisma.$transaction(async (tx) => {
    const deletedAt = new Date();

    const { count } = await tx.productVariant.updateMany({
      where: { productId: id, deletedAt: null },
      data: { deletedAt },
    });

    const product = await tx.product.update({
      where: { id, deletedAt: null },
      data: { deletedAt },
    });

    if (buildAudit) await record(buildAudit({ variants: count }), tx);

    return product;
  });
}
