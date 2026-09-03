import { prisma } from "@/lib/prisma";
import { storeImage } from "@/lib/storage";
import * as brandRepository from "@/modules/brand/brand.repository";
import * as categoryRepository from "@/modules/category/category.repository";
import * as productRepository from "@/modules/product/product.repository";
import { createProductSchema } from "@/modules/product/product.schema";
import { withResolvedDefault } from "@/modules/product/product.service";
import * as tagRepository from "@/modules/tag/tag.repository";
import {
  FAKE_BRANDS,
  FAKE_CATEGORIES,
  FAKE_PRODUCTS,
  FAKE_TAGS,
  type FakeProduct,
  type FakeVariant,
} from "./fakeCatalog.constants";
import { fakeImageBuffer } from "./fakeImages.constants";
import { seededFaker } from "./seedFaker";

export type SeedFakeCatalogResult = {
  brandsCreated: number;
  categoriesCreated: number;
  tagsCreated: number;
  productsCreated: number;
  productsSkipped: number;
  imagesStored: number;
};

/**
 * Margem do custo sobre o preço de venda: `costCents` é **derivado**, não
 * sorteado. Sortear os dois independentemente produziria custo acima do preço
 * em parte do roster, e a view de custo da 9.8 ficaria demonstrando margem
 * negativa por acidente.
 */
const COST_RATIO = 0.62;

/** Multiplicador do "de" quando a variante é `discounted`. */
const COMPARE_AT_RATIO = 1.28;

/**
 * Ignora `deletedAt` de propósito, nos quatro recursos. `slug` e `sku` são
 * unique **global** no catálogo (9.6/W6, 9.7/X1) — o índice não filtra
 * soft-deletado —, então uma checagem que só olhasse linha ativa não acharia o
 * produto excluído do roster e tentaria recriá-lo, colidindo em constraint. É o
 * mesmo cuidado que `findAnyUserByEmail` toma no seed de usuários.
 */
async function findAnyBrandBySlug(slug: string) {
  return prisma.brand.findFirst({ where: { slug } });
}

async function findAnyCategoryBySlug(slug: string) {
  return prisma.category.findFirst({ where: { slug } });
}

async function findAnyProductBySlug(slug: string) {
  return prisma.product.findFirst({ where: { slug } });
}

/**
 * Preço, custo e estoque a partir de um `faker` semeado pelo **SKU** — estável
 * entre execuções e independente da posição da variante no roster (AB13). O
 * `stockQuantity` declarado vence, porque `0` é cenário, não sorteio (AB10).
 */
function resolveMoney(variant: FakeVariant) {
  const faker = seededFaker(`variant:${variant.sku}`);
  const [min, max] = variant.priceRange;

  const priceCents = faker.number.int({ min, max });
  const stockQuantity =
    variant.stockQuantity ?? faker.number.int({ min: 3, max: 60 });

  return {
    priceCents,
    costCents: Math.round(priceCents * COST_RATIO),
    stockQuantity,
    ...(variant.discounted === true && {
      compareAtPriceCents: Math.round(priceCents * COMPARE_AT_RATIO),
    }),
  };
}

function toVariantInput(variant: FakeVariant) {
  return {
    sku: variant.sku,
    label: variant.label,
    ...resolveMoney(variant),
    ...(variant.weightGrams !== undefined && {
      weightGrams: variant.weightGrams,
    }),
    ...(variant.volumeMl !== undefined && { volumeMl: variant.volumeMl }),
    ...(variant.sizeLabel !== undefined && { sizeLabel: variant.sizeLabel }),
  };
}

/**
 * Grava as imagens de um produto pelo **adaptador de storage**, nunca copiando
 * arquivo para dentro do `UPLOAD_DIR`: `storeImage` é o mesmo caminho que a API
 * usa, então o seed produz derivado com exatamente a mesma forma (dois
 * sufixos WebP, EXIF descartado). Copiar à mão produziria arquivo diferente do
 * que o endpoint produz, e o bug apareceria só na demo.
 *
 * A linha vai por `prisma.productImage.create`, e não por `createImageAtEnd`:
 * aquele exige um `AuditDescriptor` (o seed não é ação de ninguém) e pega um
 * lock de linha para serializar posição concorrente, que aqui não existe — o
 * seed é sequencial e é o único escritor.
 */
async function storeProductImages(
  productId: string,
  product: FakeProduct,
): Promise<number> {
  let stored = 0;

  for (const [position, imageKey] of product.images.entries()) {
    const path = await storeImage({
      owner: "products",
      ownerId: productId,
      buffer: fakeImageBuffer(imageKey),
    });

    await prisma.productImage.create({ data: { productId, path, position } });
    stored++;
  }

  return stored;
}

/**
 * Cria o dataset fake do catálogo — taxonomia (marca, categoria, tag) e os 35
 * produtos com suas variantes e imagens. Só chamado quando `SEED_FAKE_DATA=true`
 * (gate em `runSeed`); esta função é incondicional para ficar testável sem
 * depender do valor da env var, igual a `seedFakeUsers`.
 *
 * Idempotente por `slug`: recurso já existente (ativo ou soft-deletado) é
 * pulado. O entrypoint de produção roda `migrate deploy → seed → start` a cada
 * boot do container, sem truncate antes, então rodar de novo não pode duplicar
 * nem colidir em constraint única.
 *
 * `withImages: false` existe **para os testes** (AB17): uma passada completa são
 * ~80 encodes de `sharp` (36 chaves × 2 derivados), e o teste de idempotência
 * chama a função duas vezes. O caminho com imagem continua exercitado por um
 * teste dedicado, com `sharp` e `LocalDiskStorage` reais.
 */
export async function seedFakeCatalog(
  options: { withImages?: boolean } = {},
): Promise<SeedFakeCatalogResult> {
  const withImages = options.withImages ?? true;

  const result: SeedFakeCatalogResult = {
    brandsCreated: 0,
    categoriesCreated: 0,
    tagsCreated: 0,
    productsCreated: 0,
    productsSkipped: 0,
    imagesStored: 0,
  };

  const brandIds = new Map<string, string>();

  for (const definition of FAKE_BRANDS) {
    const existing = await findAnyBrandBySlug(definition.slug);

    if (existing) {
      brandIds.set(definition.slug, existing.id);
      continue;
    }

    const brand = await brandRepository.createBrand({
      name: definition.name,
      slug: definition.slug,
      description: definition.description,
    });

    brandIds.set(definition.slug, brand.id);
    result.brandsCreated++;

    if (withImages) {
      const logoPath = await storeImage({
        owner: "brands",
        ownerId: brand.id,
        buffer: fakeImageBuffer(definition.logo),
      });

      await brandRepository.setBrandLogoPath(brand.id, logoPath);
      result.imagesStored++;
    }
  }

  // A ordem do array é de cima para baixo, e é o que faz a self-FK
  // `Category.parentId` sempre encontrar o pai já criado (9.6).
  const categoryIds = new Map<string, string>();

  for (const definition of FAKE_CATEGORIES) {
    const existing = await findAnyCategoryBySlug(definition.slug);

    if (existing) {
      categoryIds.set(definition.slug, existing.id);
      continue;
    }

    const parentId =
      definition.parentSlug === null
        ? null
        : (categoryIds.get(definition.parentSlug) ?? null);

    if (definition.parentSlug !== null && parentId === null) {
      throw new Error(
        `Categoria "${definition.slug}" declara o pai "${definition.parentSlug}", que não foi semeado antes dela — o roster precisa estar ordenado de cima para baixo`,
      );
    }

    const category = await categoryRepository.createCategory({
      name: definition.name,
      slug: definition.slug,
      parentId,
      position: definition.position,
    });

    categoryIds.set(definition.slug, category.id);
    result.categoriesCreated++;
  }

  const tagIds = new Map<string, string>();

  for (const definition of FAKE_TAGS) {
    const existing = await prisma.tag.findFirst({
      where: { slug: definition.slug },
    });

    if (existing) {
      tagIds.set(definition.slug, existing.id);
      continue;
    }

    const tag = await tagRepository.createTag({
      name: definition.name,
      slug: definition.slug,
    });

    tagIds.set(definition.slug, tag.id);
    result.tagsCreated++;
  }

  for (const definition of FAKE_PRODUCTS) {
    if (await findAnyProductBySlug(definition.slug)) {
      result.productsSkipped++;
      continue;
    }

    const brandId = brandIds.get(definition.brandSlug);

    if (brandId === undefined) {
      throw new Error(
        `Produto "${definition.slug}" aponta para a marca "${definition.brandSlug}", que não está em FAKE_BRANDS`,
      );
    }

    const categoryIdList = definition.categorySlugs.map((slug) => {
      const id = categoryIds.get(slug);

      if (id === undefined) {
        throw new Error(
          `Produto "${definition.slug}" aponta para a categoria "${slug}", que não está em FAKE_CATEGORIES`,
        );
      }

      return id;
    });

    const tagIdList = definition.tagSlugs.map((slug) => {
      const id = tagIds.get(slug);

      if (id === undefined) {
        throw new Error(
          `Produto "${definition.slug}" aponta para a tag "${slug}", que não está em FAKE_TAGS`,
        );
      }

      return id;
    });

    // Parse pelo schema do módulo antes de escrever — mesmo molde da factory de
    // teste (9.7): o roster passa pela mesma validação sintática que um corpo de
    // request, então um preço negativo ou um SKU longo demais estoura no seed e
    // não vira linha inválida no banco.
    const body = createProductSchema.shape.body.parse({
      name: definition.name,
      slug: definition.slug,
      description: definition.description,
      brandId,
      status: definition.status,
      targetSpecies: definition.targetSpecies,
      categories: categoryIdList,
      tags: tagIdList,
      variants: definition.variants.map(toVariantInput),
    });

    // `status` e `targetSpecies` saem nomeados e voltam condicionalmente: o
    // schema os torna opcionais, e sob `exactOptionalPropertyTypes` a chave
    // valendo `undefined` não é aceita pelo tipo do Prisma.
    const { categories, tags, variants, slug, status, targetSpecies, ...rest } =
      body;

    // Pelo repositório, não pelo service: o service pede um ator autorizado e
    // gravaria linha de audit por produto. O que ele **não** pode pular é
    // `withResolvedDefault` — "exatamente uma variante default" é invariante de
    // domínio (9.7/X5), não detalhe do endpoint.
    const product = await productRepository.createProduct(
      {
        ...rest,
        slug: slug ?? definition.slug,
        ...(status === undefined ? {} : { status }),
        ...(targetSpecies === undefined ? {} : { targetSpecies }),
      },
      withResolvedDefault(variants),
      { categoryIds: categories, tagIds: tags ?? [] },
    );

    result.productsCreated++;

    if (withImages) {
      result.imagesStored += await storeProductImages(product.id, definition);
    }

    // Por último: o soft delete é estado final do cenário, e aplicá-lo antes
    // impediria a imagem de ser gravada num produto já morto.
    if (definition.softDeleted === true) {
      await prisma.product.update({
        where: { id: product.id },
        data: { deletedAt: new Date() },
      });
    }
  }

  return result;
}
