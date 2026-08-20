import { z } from "zod";
import { createNotFoundError, createValidationError } from "@/errors";
import { ProductStatus } from "@/generated/prisma/enums";
import { type AuthUser, hasFeature } from "@/lib/authorization";
import { buildOffsetArgs, buildOrderBy } from "@/lib/pagination";
import * as brandRepository from "@/modules/brand/brand.repository";
import { resolveSlug } from "@/modules/catalog/catalog.schema";
import * as categoryRepository from "@/modules/category/category.repository";
import { subtreeIdsOf } from "@/modules/category/category.tree";
import * as tagRepository from "@/modules/tag/tag.repository";
import { definedOnly } from "@/utils/definedOnly";
import type { ProductView } from "./product.presenter";
import type { ProductWithRelations } from "./product.repository";
import * as productRepository from "./product.repository";
import {
  type CreateProductInput,
  type ListProductsQuery,
  PRODUCT_SORT,
  type UpdateProductInput,
} from "./product.schema";
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
 * O portão do catálogo interno (9.8/Y9): rascunho, descontinuado, estoque exato
 * e o campo `status`. `read:product:cost` **implica** a visão interna — quem vê
 * margem vê o resto —, então o predicado é uma disjunção e não duas perguntas.
 *
 * Existe como função própria porque é usado em dois lugares que não podem
 * divergir: o `where` da listagem e a escolha da view. Se divergissem, a
 * resposta mostraria um campo do conjunto que a lista diz não existir.
 */
export function canSeeInternal(actor: AuthUser | undefined): boolean {
  if (!actor) return false;

  return (
    hasFeature(actor, "read:product:internal") ||
    hasFeature(actor, "read:product:cost")
  );
}

/**
 * A view da **leitura**, que difere da escrita em um ponto: aqui o ator pode
 * não existir. Visitante anônimo não é erro, é o caso comum da vitrine (N15) —
 * daí `public` em vez de 401.
 */
export function readViewFor(actor: AuthUser | undefined): ProductView {
  if (!actor) return "public";
  if (hasFeature(actor, "read:product:cost")) return "cost";
  if (hasFeature(actor, "read:product:internal")) return "internal";

  return "public";
}

/**
 * Deriva a disponibilidade (9.8/Y4): `inStock` em cada variante e um no
 * produto, verdadeiro quando **alguma** variante ativa tem estoque.
 *
 * O cálculo mora aqui, e não no presenter, porque o campo entra nas três views
 * (Y10) — inclusive nas respostas de escrita da 9.7. Derivar por view seria
 * escrever a mesma regra três vezes e deixá-la divergir na primeira mudança.
 */
export function withVariantAvailability<V extends { stockQuantity: number }>(
  variant: V,
) {
  return { ...variant, inStock: variant.stockQuantity > 0 };
}

export function withAvailability<
  V extends { stockQuantity: number },
  P extends { variants: V[] },
>(
  product: P,
): Omit<P, "variants"> & {
  variants: (V & { inStock: boolean })[];
  inStock: boolean;
} {
  const variants = product.variants.map(withVariantAvailability);

  return {
    ...product,
    variants,
    inStock: variants.some((variant) => variant.inStock),
  };
}

/**
 * Achata as duas junções antes da view: o Prisma devolve `ProductCategory[]`
 * com a categoria dentro, e a API entrega a categoria direto. O `CLAUDE.md`
 * admite achatar no service ou espelhar o aninhamento na view — aqui achatar
 * ganha, porque `{ category: {...} }` na resposta pública seria detalhe de
 * modelagem vazando para o cliente.
 *
 * A disponibilidade entra no mesmo passo: toda resposta de produto do projeto
 * passa por aqui, então é o único ponto onde `inStock` precisa nascer.
 */
export function flattenProduct(product: ProductWithRelations) {
  const { categories, tags, ...rest } = product;

  return withAvailability({
    ...rest,
    categories: categories.map((link) => link.category),
    tags: tags.map((link) => link.tag),
  });
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

/**
 * Traduz o slug de categoria na subárvore dele (9.6/W2). Slug que não existe
 * vira lista **vazia**, e não `undefined`: o filtro tem que valer, senão a
 * categoria inexistente devolveria o catálogo inteiro em vez de nada.
 */
async function resolveCategoryFilter(slug: string | undefined) {
  if (!slug) return undefined;

  const categories = await categoryRepository.findAllCategories();
  const root = categories.find((category) => category.slug === slug);

  if (!root) return [];

  return subtreeIdsOf(categories, root.id);
}

export async function getProducts(
  actor: AuthUser | undefined,
  query: ListProductsQuery,
) {
  const includeHidden = canSeeInternal(actor);
  const { skip, take } = buildOffsetArgs(query);

  const { products, total } = await productRepository.findAllProducts(
    {
      species: query.species,
      categoryIds: await resolveCategoryFilter(query.category),
      tagSlugs: query.tag,
      brandSlug: query.brand,
      minPriceCents: query.minPrice,
      maxPriceCents: query.maxPrice,
      // Descartado em silêncio para quem não vê o interno (Y1): devolver 422
      // confirmaria ao visitante que existe um estado escondido.
      ...(includeHidden ? { status: query.status } : {}),
      inStock: query.inStock,
      includeHidden,
    },
    // `price` não é coluna: o repository o resolve por agregação (Y3), e o que
    // ele precisa saber é só a direção. Nos demais campos o `orderBy` sai da
    // allowlist do recurso, nunca cru do query param.
    query.sort === "price"
      ? {
          skip,
          take,
          priceOrder: query.order ?? PRODUCT_SORT.fields.price,
        }
      : { skip, take, orderBy: buildOrderBy(query, PRODUCT_SORT) },
  );

  return { products: products.map(flattenProduct), total };
}

/**
 * Detalhe por id **ou** slug na mesma rota (Y2). A forma do valor desempata, e
 * isso só é não-ambíguo porque o `slugSchema` recusa slug com cara de uuid.
 *
 * Produto fora do conjunto visível do ator é **404**, com a mesma mensagem de
 * "não existe" (Y8): a rota é pública e não tem gate de autorização, então um
 * 403 aqui confirmaria o slug do rascunho para qualquer visitante.
 */
export async function getProductByIdOrSlug(
  actor: AuthUser | undefined,
  idOrSlug: string,
) {
  const isId = z.uuid().safeParse(idOrSlug).success;

  const product = isId
    ? await productRepository.findProductById(idOrSlug)
    : await productRepository.findProductBySlug(idOrSlug);

  const visible =
    product !== null &&
    (canSeeInternal(actor) || product.status === ProductStatus.ACTIVE);

  if (!visible) {
    throw createNotFoundError({
      message: "Produto não encontrado",
      action: "Verifique o identificador e tente novamente",
    });
  }

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
