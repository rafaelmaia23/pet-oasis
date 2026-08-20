import {
  createConflictError,
  createForbiddenError,
  createNotFoundError,
} from "@/errors";
import type { AuditDescriptor } from "@/lib/auditLog";
import { type AuthUser, hasFeature } from "@/lib/authorization";
import { definedOnly } from "@/utils/definedOnly";
import type { VariantView } from "./product.presenter";
import { resolveProduct, withVariantAvailability } from "./product.service";
import * as variantRepository from "./product.variant.repository";
import type {
  CreateVariantInput,
  UpdateVariantInput,
} from "./product.variant.schema";

/**
 * Regras da variante — a unidade vendável. Três invariantes vivem aqui, porque
 * nenhuma cabe no banco:
 *
 * 1. exatamente uma default por produto (X5);
 * 2. a última variante ativa não sai (X6) — 409, no idioma do 9.6/W3;
 * 3. estoque e catálogo são **features diferentes** no mesmo `PATCH` (X4).
 */

/**
 * O corte do X4. É uma lista e não um único nome porque a Fase 10 acrescenta
 * campo de estoque (reserva), e o que decide a feature é o **campo**, não a
 * rota — deixar isso implícito faria o próximo campo cair no lado errado em
 * silêncio.
 */
const STOCK_FIELDS = [
  "stockQuantity",
] as const satisfies readonly (keyof UpdateVariantInput)[];

const isStockField = (field: string): boolean =>
  (STOCK_FIELDS as readonly string[]).includes(field);

export function viewFor(actor: AuthUser): VariantView {
  return hasFeature(actor, "read:product:cost") ? "cost" : "internal";
}

async function resolveVariant(variantId: string) {
  const variant = await variantRepository.findVariantById(variantId);

  if (!variant) {
    throw createNotFoundError({
      message: "Variante não encontrada",
      action: "Verifique o ID e tente novamente",
    });
  }

  return variant;
}

function assertCanTouch(actor: AuthUser, feature: string) {
  if (hasFeature(actor, feature)) return;

  throw createForbiddenError({
    message: "Você não tem permissão para alterar estes campos",
    action: `Verifique se você tem acesso a feature "${feature}"`,
  });
}

/**
 * Autorização campo a campo (X4): o repositor manda `stockQuantity` e passa; se
 * mandar `priceCents` no mesmo corpo, leva 403 — e o inverso vale para quem só
 * tem autoria. É o que permite ao balcão contar prateleira sem poder mexer no
 * preço, com uma rota só.
 */
function assertFieldFeatures(actor: AuthUser, input: UpdateVariantInput) {
  const fields = Object.keys(input);

  if (fields.some(isStockField)) assertCanTouch(actor, "manage:stock");

  if (fields.some((field) => !isStockField(field))) {
    assertCanTouch(actor, "manage:product");
  }
}

export async function createVariant(
  productId: string,
  input: CreateVariantInput,
) {
  await resolveProduct(productId);

  const variant = await variantRepository.createVariant(
    {
      // Mesmo motivo do `withResolvedDefault`: o Prisma recusa a chave presente
      // valendo `undefined`, e os obrigatórios voltam explicitamente.
      ...definedOnly(input),
      productId,
      sku: input.sku,
      label: input.label,
      priceCents: input.priceCents,
    },
    [
      {
        action: "PRODUCT_VARIANT_CREATED",
        targetType: "ProductVariant",
        metadata: { productId },
      },
    ],
  );

  // `inStock` é derivado e entra em **todas** as views (9.8/Y10), inclusive nas
  // respostas de escrita — a view da variante o exige, e derivá-lo aqui é o que
  // mantém uma regra só para leitura e escrita.
  return withVariantAvailability(variant);
}

export async function updateVariant(
  actor: AuthUser,
  variantId: string,
  input: UpdateVariantInput,
) {
  const variant = await resolveVariant(variantId);

  assertFieldFeatures(actor, input);

  const fields = Object.keys(input);
  const audits: AuditDescriptor[] = [];

  // Duas ações quando o corpo mistura os dois lados: a trilha de estoque tem
  // pergunta própria ("quem mexeu no estoque?") e perdê-la dentro de um
  // `PRODUCT_VARIANT_UPDATED` genérico deixaria o repositor invisível.
  if (input.stockQuantity !== undefined) {
    audits.push({
      action: "PRODUCT_STOCK_ADJUSTED",
      targetType: "ProductVariant",
      targetId: variantId,
      metadata: {
        productId: variant.productId,
        from: variant.stockQuantity,
        to: input.stockQuantity,
      },
    });
  }

  const catalogFields = fields.filter((field) => !isStockField(field));

  if (catalogFields.length > 0) {
    audits.push({
      action: "PRODUCT_VARIANT_UPDATED",
      targetType: "ProductVariant",
      targetId: variantId,
      metadata: { productId: variant.productId, fields: catalogFields },
    });
  }

  return withVariantAvailability(
    await variantRepository.updateVariant(variantId, input, audits),
  );
}

export async function deleteVariant(variantId: string) {
  const variant = await resolveVariant(variantId);

  const siblings = await variantRepository.countActiveSiblings(
    variant.productId,
    variantId,
  );

  if (siblings === 0) {
    throw createConflictError({
      message: "O produto precisa de pelo menos uma variante ativa",
      action:
        "Para tirar o produto de circulação use o status DISCONTINUED ou exclua o produto",
    });
  }

  const promoted = variant.isDefault
    ? await variantRepository.findOldestActiveSibling(
        variant.productId,
        variantId,
      )
    : null;

  await variantRepository.softDeleteVariant(variantId, promoted?.id ?? null, [
    {
      action: "PRODUCT_VARIANT_DELETED",
      targetType: "ProductVariant",
      targetId: variantId,
      metadata: {
        productId: variant.productId,
        ...(promoted ? { promotedVariantId: promoted.id } : {}),
      },
    },
  ]);
}
