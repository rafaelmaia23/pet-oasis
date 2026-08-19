import { createNotFoundError, createValidationError } from "@/errors";
import { type AuthUser, hasFeature } from "@/lib/authorization";
import * as brandRepository from "@/modules/brand/brand.repository";
import { resolveSlug } from "@/modules/catalog/catalog.schema";
import * as categoryRepository from "@/modules/category/category.repository";
import * as tagRepository from "@/modules/tag/tag.repository";
import { definedOnly } from "@/utils/definedOnly";
import type { ProductView } from "./product.presenter";
import type { ProductWithRelations } from "./product.repository";
import * as productRepository from "./product.repository";
import type { CreateProductInput, UpdateProductInput } from "./product.schema";
import type { VariantInput } from "./product.variant.schema";

/**
 * Regras **semânticas** do produto — as que precisam do banco. Sem escopo
 * `own` × `:others`: catálogo é da loja, não de um dono, então a rota já
 * resolve a autorização com `manage:product` e o que sobra aqui é a existência
 * das pontas (marca, categoria, tag) e o invariante da variante default.
 */

export async function resolveProduct(productId: string) {
  const product = await productRepository.findProductById(productId);

  if (!product) {
    throw createNotFoundError({
      message: "Produto não encontrado",
      action: "Verifique o ID e tente novamente",
    });
  }

  return product;
}

/**
 * A view é do **ator**, não da rota: quem escreve sempre tem `manage:product`,
 * mas custo é delegado à parte (`read:product:cost`, 9.1), e um autor sem essa
 * feature não pode ver a margem só porque acabou de salvar o produto.
 */
export function viewFor(actor: AuthUser): ProductView {
  return hasFeature(actor, "read:product:cost") ? "cost" : "internal";
}

/**
 * Achata as duas junções antes da view: o Prisma devolve `ProductCategory[]`
 * com a categoria dentro, e a API entrega a categoria direto. O `CLAUDE.md`
 * admite achatar no service ou espelhar o aninhamento na view — aqui achatar
 * ganha, porque `{ category: {...} }` na resposta pública seria detalhe de
 * modelagem vazando para o cliente.
 */
export function flattenProduct(product: ProductWithRelations) {
  const { categories, tags, ...rest } = product;

  return {
    ...rest,
    categories: categories.map((link) => link.category),
    tags: tags.map((link) => link.tag),
  };
}

async function assertBrandIsActive(brandId: string) {
  const brand = await brandRepository.findBrandById(brandId);

  if (!brand) {
    throw createValidationError({
      errors: { brandId: ["Marca não encontrada"] },
    });
  }
}

/**
 * Valida a lista inteira com uma query e nomeia no erro **os ids que
 * sobraram** — dizer só "categoria inválida" mandaria o staff caçar qual dos
 * vinte é o errado.
 */
async function assertCategoriesAreActive(categoryIds: string[]) {
  const found = await categoryRepository.findActiveCategoryIds(categoryIds);
  const missing = categoryIds.filter((id) => !found.includes(id));

  if (missing.length > 0) {
    throw createValidationError({
      errors: {
        categories: [`Categoria não encontrada: ${missing.join(", ")}`],
      },
    });
  }
}

async function assertTagsExist(tagIds: string[]) {
  const found = await tagRepository.findExistingTagIds(tagIds);
  const missing = tagIds.filter((id) => !found.includes(id));

  if (missing.length > 0) {
    throw createValidationError({
      errors: { tags: [`Tag não encontrada: ${missing.join(", ")}`] },
    });
  }
}

/**
 * Elege a default quando nenhuma variante do corpo veio marcada (X5): a
 * primeira. "Mais de uma marcada" já foi recusada no schema — aqui só resta o
 * caso silencioso, e deixá-lo passar criaria produto sem variante default, que
 * é o que a vitrine da 9.8 não saberia mostrar.
 */
export function withResolvedDefault(variants: VariantInput[]) {
  const hasExplicitDefault = variants.some((variant) => variant.isDefault);

  return variants.map((variant, index) => ({
    // `definedOnly` derruba os opcionais ausentes (o Prisma não aceita a chave
    // valendo `undefined`); os obrigatórios voltam explicitamente porque o tipo
    // resultante torna tudo opcional.
    ...definedOnly(variant),
    sku: variant.sku,
    label: variant.label,
    priceCents: variant.priceCents,
    isDefault: hasExplicitDefault ? variant.isDefault === true : index === 0,
  }));
}

export async function createProduct(input: CreateProductInput) {
  const { slug, categories, tags, variants, targetSpecies, status, ...rest } =
    input;

  await assertBrandIsActive(input.brandId);
  await assertCategoriesAreActive(categories);
  if (tags?.length) await assertTagsExist(tags);

  const product = await productRepository.createProduct(
    {
      ...rest,
      slug: resolveSlug(input.name, slug),
      ...(status === undefined ? {} : { status }),
      ...(targetSpecies === undefined ? {} : { targetSpecies }),
    },
    withResolvedDefault(variants),
    { categoryIds: categories, tagIds: tags ?? [] },
    { action: "PRODUCT_CREATED", targetType: "Product" },
  );

  return flattenProduct(product);
}

/**
 * O slug **não** é re-derivado quando o nome muda (9.6/W4, reaplicada): o link
 * público sobrevive à correção de digitação. Quem quer mudá-lo manda o campo.
 */
export async function updateProduct(
  productId: string,
  input: UpdateProductInput,
) {
  await resolveProduct(productId);

  const { categories, tags, ...fields } = input;

  if (fields.brandId) await assertBrandIsActive(fields.brandId);
  if (categories) await assertCategoriesAreActive(categories);
  if (tags?.length) await assertTagsExist(tags);

  const product = await productRepository.updateProduct(
    productId,
    fields,
    {
      ...(categories === undefined ? {} : { categoryIds: categories }),
      ...(tags === undefined ? {} : { tagIds: tags }),
    },
    {
      action: "PRODUCT_UPDATED",
      targetType: "Product",
      targetId: productId,
      metadata: { fields: Object.keys(input) },
    },
  );

  return flattenProduct(product);
}

export async function deleteProduct(productId: string) {
  await resolveProduct(productId);

  await productRepository.softDeleteProduct(productId, ({ variants }) => ({
    action: "PRODUCT_DELETED",
    targetType: "Product",
    targetId: productId,
    // A cascata fica visível na trilha sem gerar uma linha por variante —
    // mesmo critério de `cascadedPets` (9.4).
    metadata: { cascadedVariants: variants },
  }));
}
