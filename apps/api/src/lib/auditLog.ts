import type {
  AuditAction,
  AuditTargetType,
} from "@pet-oasis/api-contracts/audit-log";
import type { Prisma } from "@/generated/prisma/client";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestContext } from "@/lib/requestContext";

const log = logger.child({ module: "audit" });

/**
 * O que gravar. A semântica (action/targetType/targetId/metadata) é decisão de
 * negócio: quem monta o descritor é o service. `actorId`/`ip`/`userAgent` saem
 * do request context (7.3); `actorId` aceita override explícito para os casos
 * sem request (scripts/seed).
 */
export type AuditDescriptor = {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  // Só ids e enums — nunca PII (docs/reference/logging-policy.md §4.4). Garantido pelos
  // call sites + teste de contrato, não por validação em runtime. Listas de
  // escalar entram porque um conjunto de enums continua sendo enum: a
  // reativação de usuário precisa dizer **quais** perfis voltaram, não quantos.
  metadata?: Record<string, string | number | boolean | string[]>;
  actorId?: string;
};

/**
 * Grava uma linha de auditoria.
 *
 * **Com `tx`** (ação que muda estado): escreve na mesma `$transaction` da
 * mutação e deixa o erro **propagar** — se o audit falha, a ação inteira
 * reverte (§4.5). Uma trilha com buracos é pior que trilha nenhuma.
 *
 * **Sem `tx`** (evento sem mutação — login falho, futuramente rate limit e
 * lockout): grava direto e a falha **não** derruba o request, só emite `error`
 * no application log (§4.6).
 */
export async function record(
  descriptor: AuditDescriptor,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const context = getRequestContext();

  const data = {
    action: descriptor.action,
    targetType: descriptor.targetType,
    targetId: descriptor.targetId ?? null,
    // Campo Json: omitir quando ausente (Prisma trata `null` cru de forma
    // especial em Json, exigindo Prisma.JsonNull).
    ...(descriptor.metadata ? { metadata: descriptor.metadata } : {}),
    actorId: descriptor.actorId ?? context?.actorId ?? null,
    ip: context?.ip ?? null,
    userAgent: context?.userAgent ?? null,
  };

  if (tx) {
    await tx.auditLog.create({ data });
    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    log.error(
      { err: error, action: descriptor.action },
      "failed to write audit log",
    );
  }
}

/**
 * Roda `work` numa `$transaction` e grava o audit nela — o braço de dois
 * caminhos ("sem transação quando não audita" / "com transação quando
 * audita") que treze repositórios repetiam desaparece porque deixa de existir
 * um call site que legitimamente não audita (docs/adr/0205). `audit` aceita
 * um descritor pronto ou um builder do resultado, para o `targetId` gerado
 * pelo banco ou uma contagem só conhecida dentro da transação.
 *
 * Não é para toda escrita transacional com audit — só para a de uma ação
 * única e sempre-auditada. `verificationToken.repository.ts` continua fora:
 * atende quatro purposes e só três têm ação na taxonomia.
 */
export async function writeAudited<T>(
  audit: AuditDescriptor | ((result: T) => AuditDescriptor),
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const result = await work(tx);

    await record(typeof audit === "function" ? audit(result) : audit, tx);

    return result;
  });
}
