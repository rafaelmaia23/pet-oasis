import { createNotFoundError } from "@/errors";
import { deleteImage, imageUrls, storeImage } from "@/lib/storage";
import { resolveSlug } from "@/modules/catalog/catalog.schema";
import * as brandRepository from "./brand.repository";
import type { CreateBrandInput, UpdateBrandInput } from "./brand.schema";

/**
 * Sem escopo `own` × `:others`: marca é dado global da loja, não de um dono. A
 * rota já exige `manage:catalog-structure` na escrita e nada na leitura (a
 * vitrine é pública), então não sobra ramo para o service separar — o que sobra
 * é a derivação do slug e o 404 do alvo morto.
 */

/**
 * Troca a chave gravada pelas duas URLs antes de a marca sair — o mesmo ponto
 * único de derivação que `withPhoto` é no pet. `flattenProduct` chama esta
 * função para a marca aninhada, para que a view seja a mesma nos dois lugares.
 */
export function withLogo<B extends { logoPath: string | null }>(brand: B) {
  const { logoPath, ...rest } = brand;

  return {
    ...rest,
    logo: logoPath === null ? null : imageUrls(logoPath),
  };
}

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
  const brands = await brandRepository.findAllBrands();

  return brands.map(withLogo);
}

export async function createBrand(input: CreateBrandInput) {
  const { slug, description, ...rest } = input;

  const brand = await brandRepository.createBrand(
    {
      ...rest,
      slug: resolveSlug(input.name, slug),
      ...(description === undefined ? {} : { description }),
    },
    { action: "BRAND_CREATED", targetType: "Brand" },
  );

  return withLogo(brand);
}

/**
 * O slug **não** é re-derivado quando o nome muda (9.6/W4): renomear é a
 * mudança mais banal do catálogo, e deixá-la mexer na URL quebraria todo link
 * externo. Quem quiser mudar o slug manda o campo.
 */
export async function updateBrand(brandId: string, input: UpdateBrandInput) {
  await resolveBrand(brandId);

  const brand = await brandRepository.updateBrand(brandId, input, {
    action: "BRAND_UPDATED",
    targetType: "Brand",
    targetId: brandId,
    metadata: { fields: Object.keys(input) },
  });

  return withLogo(brand);
}

/**
 * Valor único num endereço fixo: `PUT` substitui e apaga o arquivo anterior
 * **depois** de a coluna já apontar para o novo (9.10/AA7) — quebrar no meio
 * deixa órfão no disco, nunca marca apontando para o nada.
 */
export async function setBrandLogo(brandId: string, buffer: Buffer) {
  const brand = await resolveBrand(brandId);

  const logoPath = await storeImage({
    owner: "brands",
    ownerId: brand.id,
    buffer,
  });

  const updated = await brandRepository.setBrandLogoPath(brand.id, logoPath, {
    action: "BRAND_LOGO_UPDATED",
    targetType: "Brand",
    targetId: brand.id,
  });

  if (brand.logoPath) await deleteImage(brand.logoPath);

  return withLogo(updated);
}

/** Idempotente: marca sem logo já está no estado desejado. */
export async function removeBrandLogo(brandId: string) {
  const brand = await resolveBrand(brandId);

  if (!brand.logoPath) return;

  await brandRepository.setBrandLogoPath(brand.id, null, {
    action: "BRAND_LOGO_DELETED",
    targetType: "Brand",
    targetId: brand.id,
  });

  await deleteImage(brand.logoPath);
}

export async function deleteBrand(brandId: string) {
  await resolveBrand(brandId);

  await brandRepository.softDeleteBrand(brandId, {
    action: "BRAND_DELETED",
    targetType: "Brand",
    targetId: brandId,
  });
}
