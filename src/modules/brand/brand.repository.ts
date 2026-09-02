import type { Prisma } from "@/generated/prisma/client";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";
import { definedOnly } from "@/utils/definedOnly";
import type { UpdateBrandInput } from "./brand.schema";

/**
 * Única camada que toca o Prisma no módulo. Toda leitura filtra
 * `deletedAt: null` — por isso `findFirst`, nunca `findUnique`.
 */

export async function findBrandById(id: string) {
  return prisma.brand.findFirst({ where: { id, deletedAt: null } });
}

export async function findAllBrands() {
  return prisma.brand.findMany({
    where: { deletedAt: null },
    // Sem paginação (9.6/W7): a taxonomia é conjunto pequeno e estável, mesma
    // classe de `GET /roles` e `GET /breeds`. `name` é unique, então já
    // desempata sozinho.
    orderBy: { name: "asc" },
  });
}

export async function createBrand(
  data: Prisma.BrandUncheckedCreateInput,
  audit?: AuditDescriptor,
) {
  const args = { data };

  if (!audit) return prisma.brand.create(args);

  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.create(args);

    await record({ ...audit, targetId: brand.id }, tx);

    return brand;
  });
}

async function applyUpdate(
  id: string,
  data: Prisma.BrandUncheckedUpdateInput,
  audit?: AuditDescriptor,
) {
  const args = { where: { id, deletedAt: null }, data };

  if (!audit) return prisma.brand.update(args);

  return prisma.$transaction(async (tx) => {
    const brand = await tx.brand.update(args);

    await record(audit, tx);

    return brand;
  });
}

export async function updateBrand(
  id: string,
  data: UpdateBrandInput,
  audit?: AuditDescriptor,
) {
  // `definedOnly` é o que reconcilia o opcional do Zod (`campo?: T | undefined`)
  // com o do Prisma (`campo?: T`) sob `exactOptionalPropertyTypes`.
  return applyUpdate(id, definedOnly(data), audit);
}

/**
 * Única escrita da coluna (9.10): o `PATCH /brands/:brandId` recusa `logoPath`
 * no corpo (`z.never` no schema), então o upload é o único caminho de entrada.
 */
export async function setBrandLogoPath(
  id: string,
  logoPath: string | null,
  audit?: AuditDescriptor,
) {
  return applyUpdate(id, { logoPath }, audit);
}

export async function softDeleteBrand(id: string, audit?: AuditDescriptor) {
  return applyUpdate(id, { deletedAt: new Date() }, audit);
}
