import type { Prisma } from "@/generated/prisma/client";
import type {
  ProfileKind,
  VerificationPurpose,
} from "@/generated/prisma/enums";
import { type AuditDescriptor, record } from "@/lib/auditLog";
import { prisma } from "@/lib/prisma";

/**
 * **VerificationToken** — o termo do glossário (`apps/api/CONTEXT.md`) escrito
 * uma vez só: token opaco, de uso único, guardado só como hash, com um
 * `purpose` e uma expiração (`docs/adr/0069-verificationtoken-generico-purpose.md`).
 *
 * Este arquivo é o lado do banco; o de cima está em `verificationToken.service.ts`.
 *
 * Existe porque cada purpose reconstruía a sequência inteira: cinco sites de
 * emissão, quatro transações de consumo, e o predicado de validade retipado
 * verbatim quatro vezes. Uso único era imposto em oito lugares independentes —
 * tirar uma cláusula de um deles transformava aquele token numa credencial
 * replayável, e nada estrutural perceberia.
 *
 * **O que consumir significa, e por que é uma transação só.** Consumir é marcar
 * `usedAt` **e** rodar o efeito do purpose (ativar a conta, trocar a senha,
 * promover o email, reativar o usuário) — os dois juntos ou nenhum. Se o efeito
 * falhasse depois da marca, o token ficaria queimado sem a ação ter acontecido,
 * e o usuário não teria como tentar de novo: a credencial é de uso único.
 *
 * O efeito chega por parâmetro e o cliente da transação é entregue a ele; o
 * módulo nunca vai buscar o Prisma por conta de quem chama. É o que deixa a
 * escrita transacional de auditoria no repository, como
 * `docs/adr/0098-gravacao-transacional-audit-vive-repository-service.md` exige,
 * sem que o service precise abrir transação nenhuma.
 */

/** A linha inteira, como o banco a devolve. */
export type VerificationTokenRow = NonNullable<
  Awaited<ReturnType<typeof findVerificationTokenByHash>>
>;

/** O que a validade precisa saber de um token, e nada mais. */
export type VerificationTokenLifecycle = {
  purpose: VerificationPurpose;
  usedAt: Date | null;
  expiresAt: Date;
};

/**
 * O efeito de um purpose: o que roda **dentro** da transação que marca o token
 * como usado. Recebe o cliente da transação e o token que a autorizou.
 */
export type VerificationTokenEffect<T> = (
  tx: Prisma.TransactionClient,
  token: VerificationTokenRow,
) => Promise<T>;

/** O descritor da linha de auditoria, ou o que o resultado do efeito decide. */
export type VerificationTokenAudit<T> =
  | AuditDescriptor
  | ((result: T) => AuditDescriptor);

/** O que o banco guarda no lugar do valor cru: o hash, o purpose e o prazo. */
export type StoredVerificationToken = {
  tokenHash: string;
  purpose: VerificationPurpose;
  expiresAt: Date;
};

export type NewVerificationToken = StoredVerificationToken & {
  userId: string;
  /** Só com `purpose = EMAIL_CHANGE`: o alvo da troca, congelado no token. */
  newEmail?: string;
  /** Só com `purpose = ACCOUNT_REACTIVATION`: a escolha do ator, congelada. */
  restoreProfiles?: ProfileKind[];
  restoreRoleIds?: string[];
};

/** Por que um token não serve — para o log, nunca para a resposta (ADR-0071). */
export type VerificationTokenRefusal =
  | "UNKNOWN_TOKEN"
  | "WRONG_PURPOSE"
  | "ALREADY_USED"
  | "EXPIRED";

/**
 * As cláusulas da validade, numa lista só: é deste purpose, ainda não foi usado
 * e ainda não expirou. O token que não existe entra aqui como `null` de
 * propósito — quem consome não tem um quarto desfecho para ele
 * (`docs/adr/0071-token-invalido-expirado-usado-400-generico.md`).
 *
 * A fronteira do prazo é `>`, como o `gt` do banco: um token que expira
 * exatamente agora já não serve.
 *
 * Devolve o **motivo**, e não um booleano, porque julgar e explicar são a mesma
 * leitura: `isUsableVerificationToken` é esta função sem o motivo. O log
 * distingue os quatro casos e a resposta não distingue nenhum — essa é a única
 * assimetria entre os dois, e ela fica aqui, numa lista que uma cláusula nova
 * não tem como atualizar pela metade.
 */
export function verificationTokenRefusal(
  token: VerificationTokenLifecycle | null,
  purpose: VerificationPurpose,
  now: Date = new Date(),
): VerificationTokenRefusal | null {
  if (token === null) return "UNKNOWN_TOKEN";
  if (token.purpose !== purpose) return "WRONG_PURPOSE";
  if (token.usedAt !== null) return "ALREADY_USED";
  if (token.expiresAt <= now) return "EXPIRED";

  return null;
}

/** O mesmo julgamento, como guarda de tipo: sem motivo de recusa, serve. */
export function isUsableVerificationToken<T extends VerificationTokenLifecycle>(
  token: T | null,
  purpose: VerificationPurpose,
  now: Date = new Date(),
): token is T {
  return verificationTokenRefusal(token, purpose, now) === null;
}

/** O `where` do token pendente de um purpose — o que a emissão supera. */
export function pendingTokensOfUserWhere(
  userId: string,
  purpose: VerificationPurpose,
) {
  return {
    userId,
    purpose,
    usedAt: null,
  } satisfies Prisma.VerificationTokenWhereInput;
}

/**
 * Cria o token dentro de uma transação que já existe. É o que deixa a emissão
 * viajar junto de uma escrita maior — o `POST /users/:id/force-password-reset`
 * grava `mustChangePassword`, derruba as sessões e emite o token no mesmo ato.
 */
export function createVerificationTokenIn(
  tx: Prisma.TransactionClient,
  data: NewVerificationToken,
) {
  return tx.verificationToken.create({ data });
}

/**
 * Queima o token pendente deste purpose antes de o novo nascer: no máximo um
 * vivo por usuário por purpose (mesmo idioma de "unicidade do ativo por código"
 * de `UserFeature`/`UserRole`), o que de quebra é o cancelamento implícito de
 * um pedido em andamento.
 */
export function supersedePendingTokensIn(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: VerificationPurpose,
  at: Date,
) {
  return tx.verificationToken.updateMany({
    where: pendingTokensOfUserWhere(userId, purpose),
    data: { usedAt: at },
  });
}

export type CreateVerificationTokenOptions = {
  /** Queima o pendente do mesmo purpose antes de criar (ver `supersedePendingTokensIn`). */
  supersedePending?: boolean;
  /** O que mais a emissão escreve, na mesma transação (ex.: `User.pendingEmail`). */
  effect?: VerificationTokenEffect<unknown>;
  audit?: AuditDescriptor;
};

export async function createVerificationToken(
  data: NewVerificationToken,
  options: CreateVerificationTokenOptions = {},
) {
  const { supersedePending, effect, audit } = options;

  // Emissão sem nada a acompanhar é uma escrita só: abrir transação para ela
  // seria uma ida ao banco a mais por token emitido.
  if (!supersedePending && !effect && !audit) {
    return prisma.verificationToken.create({ data });
  }

  return prisma.$transaction(async (tx) => {
    const at = new Date();

    if (supersedePending) {
      await supersedePendingTokensIn(tx, data.userId, data.purpose, at);
    }

    const token = await createVerificationTokenIn(tx, data);

    if (effect) await effect(tx, token);
    if (audit) await record(audit, tx);

    return token;
  });
}

export async function findVerificationTokenByHash(tokenHash: string) {
  return prisma.verificationToken.findUnique({ where: { tokenHash } });
}

/**
 * **A única transação de consumo do projeto.** Marca `usedAt`, roda o efeito do
 * purpose e grava a linha de auditoria — os três no mesmo ato, ou nenhum.
 *
 * Quem chama já validou o token (`consumeVerificationToken` do service é o
 * único caminho): aqui a marca é incondicional, como era em cada uma das quatro
 * transações que este corpo substituiu.
 */
export async function markUsedAndApply<T>(
  token: VerificationTokenRow,
  effect: VerificationTokenEffect<T>,
  audit?: VerificationTokenAudit<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.verificationToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });

    const result = await effect(tx, token);

    if (audit) {
      await record(typeof audit === "function" ? audit(result) : audit, tx);
    }

    return result;
  });
}
