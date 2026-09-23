import { faker } from "@faker-js/faker";
import {
  type CreateProductInput,
  createProductSchema,
} from "@pet-oasis/api-contracts/catalog";
import { prisma } from "@/lib/prisma";
import * as productRepository from "@/modules/product/product.repository";
import { withResolvedDefault } from "@/modules/product/product.service";
import { slugify } from "@/utils/slugify";

/**
 * Taxonomia mínima para um produto existir: `brandId` é obrigatório e o produto
 * precisa de ≥1 categoria (9.7/X7). Diferente de `Breed`, marca e categoria são
 * **transacionais** (entram no `clearDatabase`), então cada teste cria as suas —
 * daí o sufixo aleatório: `name` e `slug` são unique global (9.6/W6).
 */
export async function buildCatalogTaxonomy() {
  const suffix = faker.string.alphanumeric(6).toLowerCase();

  const brand = await prisma.brand.create({
    data: { name: `Marca ${suffix}`, slug: `marca-${suffix}` },
  });
  const category = await prisma.category.create({
    data: { name: `Categoria ${suffix}`, slug: `categoria-${suffix}` },
  });

  return { brand, category };
}

export function makeProductData(
  brandId: string,
  categoryId: string,
  overrides?: Partial<CreateProductInput>,
): CreateProductInput {
  const name = overrides?.name ?? `Produto ${faker.string.alphanumeric(6)}`;

  return createProductSchema.shape.body.parse({
    name,
    slug: overrides?.slug ?? slugify(name),
    description: overrides?.description ?? faker.commerce.productDescription(),
    brandId,
    categories: overrides?.categories ?? [categoryId],
    ...(overrides?.tags !== undefined && { tags: overrides.tags }),
    ...(overrides?.status !== undefined && { status: overrides.status }),
    ...(overrides?.targetSpecies !== undefined && {
      targetSpecies: overrides.targetSpecies,
    }),
    variants: overrides?.variants ?? [
      {
        sku: faker.string.alphanumeric(10).toUpperCase(),
        label: "Único",
        priceCents: faker.number.int({ min: 500, max: 50_000 }),
        stockQuantity: faker.number.int({ min: 0, max: 50 }),
      },
    ],
  });
}

/**
 * Escreve pelo **repository**, não pelo service: a factory monta *estado*, não
 * exercita o fluxo — mesmo corte de `pet.factory.ts`. O que ela não pode pular é
 * `withResolvedDefault`, porque a variante default é invariante do domínio
 * (X5), não detalhe do endpoint.
 */
export async function buildProduct(
  brandId: string,
  categoryId: string,
  overrides?: Partial<CreateProductInput>,
) {
  const { categories, tags, variants, slug, status, targetSpecies, ...rest } =
    makeProductData(brandId, categoryId, overrides);

  return productRepository.createProduct(
    {
      ...rest,
      slug: slug ?? slugify(rest.name),
      ...(status === undefined ? {} : { status }),
      ...(targetSpecies === undefined ? {} : { targetSpecies }),
    },
    withResolvedDefault(variants),
    { categoryIds: categories, tagIds: tags ?? [] },
  );
}
