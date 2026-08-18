import { createNotFoundError } from "@/errors";
import { resolveSlug } from "@/modules/catalog/catalog.schema";
import * as brandRepository from "./brand.repository";
import type { CreateBrandInput, UpdateBrandInput } from "./brand.schema";

/**
 * Sem escopo `own` × `:others`: marca é dado global da loja, não de um dono. A
 * rota já exige `manage:catalog-structure` na escrita e nada na leitura (a
 * vitrine é pública), então não sobra ramo para o service separar — o que sobra
 * é a derivação do slug e o 404 do alvo morto.
 */

async function resolveBrand(brandId: string) {
  const brand = await brandRepository.findBrandById(brandId);

  if (!brand) {
    throw createNotFoundError({
      message: "Marca não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return brand;
}

export async function getBrands() {
  return brandRepository.findAllBrands();
}

export async function createBrand(input: CreateBrandInput) {
  const { slug, description, ...rest } = input;

  return brandRepository.createBrand(
    {
      ...rest,
      slug: resolveSlug(input.name, slug),
      ...(description === undefined ? {} : { description }),
    },
    { action: "BRAND_CREATED", targetType: "Brand" },
  );
}

/**
 * O slug **não** é re-derivado quando o nome muda (9.6/W4): renomear é a
 * mudança mais banal do catálogo, e deixá-la mexer na URL quebraria todo link
 * externo. Quem quiser mudar o slug manda o campo.
 */
export async function updateBrand(brandId: string, input: UpdateBrandInput) {
  await resolveBrand(brandId);

  return brandRepository.updateBrand(brandId, input, {
    action: "BRAND_UPDATED",
    targetType: "Brand",
    targetId: brandId,
    metadata: { fields: Object.keys(input) },
  });
}

export async function deleteBrand(brandId: string) {
  await resolveBrand(brandId);

  await brandRepository.softDeleteBrand(brandId, {
    action: "BRAND_DELETED",
    targetType: "Brand",
    targetId: brandId,
  });
}
