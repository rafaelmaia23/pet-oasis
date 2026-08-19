import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { UpdateProductInput } from "./product.schema";

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

export async function countActiveProductsOfBrand(brandId: string) {
  return prisma.product.count({ where: { brandId, deletedAt: null } });
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
