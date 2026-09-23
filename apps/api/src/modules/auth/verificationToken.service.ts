import { createBadRequestError } from "@/errors";
import type {
  ProfileKind,
  VerificationPurpose,
} from "@/generated/prisma/enums";
import type { AuditDescriptor } from "@/lib/auditLog";
import { logger } from "@/lib/logger";
import { generateOpaqueToken, hashToken } from "@/lib/token";
import {
  ACCOUNT_REACTIVATION_TTL_MS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from "./auth.constants";
import {
  createVerificationToken,
  findVerificationTokenByHash,
  markUsedAndApply,
  type StoredVerificationToken,
  type VerificationTokenAudit,
  type VerificationTokenEffect,
  type VerificationTokenRow,
  verificationTokenRefusal,
} from "./verificationToken.repository";

const log = logger.child({ module: "verification-token" });

/**
 * Emitir e consumir um `VerificationToken`, parametrizados pelo `purpose`. É o
 * lado de cima do módulo cujo lado do banco é `verificationToken.repository.ts`
 * — leia lá o porquê de o consumo ser uma transação só.
 *
 * O que cada purpose ainda decide sozinho, e por isso continua no service dele
 * (`docs/adr/0072-orquestracao-vive-verification-service-ts-nao-auth.md`): o
 * que o email diz, que outros guards a ação exige (conta suspensa, perfil a
 * criar), o corpo do 400 genérico e o efeito que o consumo aplica. O que
 * nenhum decide mais: gerar o token, hasheá-lo, escolher o prazo, achar a
 * linha, julgar a validade e marcar o uso.
 */

/**
 * O prazo de cada purpose. Um `Record` do enum do Prisma, e não quatro
 * constantes soltas: um `purpose` novo sem prazo declarado não compila.
 */
export const VERIFICATION_TOKEN_TTL_MS: Record<VerificationPurpose, number> = {
  EMAIL_VERIFICATION: EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET: PASSWORD_RESET_TTL_MS,
  EMAIL_CHANGE: EMAIL_VERIFICATION_TTL_MS,
  ACCOUNT_REACTIVATION: ACCOUNT_REACTIVATION_TTL_MS,
};

export type MintedVerificationToken = {
  /** O valor que vai no link do email — é a credencial, e não se guarda. */
  rawToken: string;
  /** O que o banco recebe no lugar dele. */
  stored: StoredVerificationToken;
};

/**
 * Sorteia o token do purpose: o valor cru para quem vai recebê-lo por email, e
 * o que o banco guarda no lugar dele. Separado da emissão porque uma escrita
 * maior pode precisar criar a linha dentro da própria transação — o
 * `force-password-reset` é o caso.
 */
export function mintVerificationToken(
  purpose: VerificationPurpose,
): MintedVerificationToken {
  const rawToken = generateOpaqueToken();

  return {
    rawToken,
    stored: {
      tokenHash: hashToken(rawToken),
      purpose,
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS[purpose]),
    },
  };
}

/**
 * O que cada purpose congela no token, pelo purpose — dois deles carregam uma
 * carga própria, e os outros dois não carregam nenhuma.
 *
 * É união discriminada pela mesma razão do `Record` de TTL acima: emitir um
 * `EMAIL_CHANGE` sem o alvo, ou um `EMAIL_VERIFICATION` com ele, deixa de ser
 * possível de escrever em vez de ser possível de errar.
 */
type VerificationTokenPayload =
  | { purpose: "EMAIL_VERIFICATION" | "PASSWORD_RESET" }
  /** O alvo da troca: quem confirma tem o link, não o endereço. */
  | { purpose: "EMAIL_CHANGE"; newEmail: string }
  /** A escolha do ator: quem confirma é o dono da conta, não quem escolheu. */
  | {
      purpose: "ACCOUNT_REACTIVATION";
      restore: { profiles: ProfileKind[]; roleIds: string[] };
    };

export type IssueVerificationTokenSpec = VerificationTokenPayload & {
  userId: string;
  /** Queima o pendente do mesmo purpose — um pedido novo cancela o anterior. */
  supersedePending?: boolean;
  /** O que mais a emissão escreve, na mesma transação. */
  effect?: VerificationTokenEffect<unknown>;
  audit?: AuditDescriptor;
};

/**
 * Emite o token e devolve o valor cru — o único momento em que ele existe fora
 * do email de quem o recebe.
 */
export async function issueVerificationToken(
  spec: IssueVerificationTokenSpec,
): Promise<string> {
  const { rawToken, stored } = mintVerificationToken(spec.purpose);

  const options = {
    ...(spec.supersedePending !== undefined && {
      supersedePending: spec.supersedePending,
    }),
    ...(spec.effect && { effect: spec.effect }),
    ...(spec.audit && { audit: spec.audit }),
  };

  await createVerificationToken(
    {
      userId: spec.userId,
      ...stored,
      ...("newEmail" in spec && { newEmail: spec.newEmail }),
      ...("restore" in spec && {
        restoreProfiles: spec.restore.profiles,
        restoreRoleIds: spec.restore.roleIds,
      }),
    },
    options,
  );

  return rawToken;
}

/** O que o consumo aplica: o efeito do purpose e a linha de auditoria dele. */
export type ConsumePlan<T> = {
  effect: VerificationTokenEffect<T>;
  audit?: VerificationTokenAudit<T>;
};

export type ConsumeVerificationTokenSpec<T> = {
  /** O valor que chegou pela rede; o que se procura é o hash dele. */
  rawToken: string;
  purpose: VerificationPurpose;
  /** O corpo do 400 genérico deste purpose (ADR-0071). */
  invalidTokenError: { message: string; action: string };
  /**
   * O que fazer com um token válido, decidido **fora** da transação: os guards
   * que ainda faltam (conta suspensa, usuário sumido) e o trabalho caro (hash
   * de senha, busca de roles) rodam aqui, e o plano que isto devolve é o que o
   * consumo aplica lá dentro. Fora da transação de propósito: um argon2 não
   * segura conexão de banco, e uma recusa daqui não deixa o token queimado.
   */
  plan: (token: VerificationTokenRow) => Promise<ConsumePlan<T>>;
};

/**
 * Consome o token: valida, monta o plano do purpose e roda o efeito na mesma
 * transação que marca o uso. Devolve o token consumido — é dele que sai o que
 * o service registra depois (de quem era, que escolha carregava).
 *
 * Recusa com o 400 genérico do purpose sempre que o token não serve — não
 * existe, é de outro purpose, já foi usado ou expirou. Os quatro desfechos são
 * o mesmo corpo, e é isso que impede o erro de contar a quem tem um token
 * qualquer se ele existiu um dia (ADR-0071). Quem investiga tem o log, que
 * distingue os quatro.
 */
export async function consumeVerificationToken<T>(
  spec: ConsumeVerificationTokenSpec<T>,
): Promise<VerificationTokenRow> {
  const token = await findVerificationTokenByHash(hashToken(spec.rawToken));
  const refusal = verificationTokenRefusal(token, spec.purpose);

  if (refusal !== null || token === null) {
    log.warn(
      {
        purpose: spec.purpose,
        ...(token && { userId: token.userId }),
        reason: refusal,
      },
      "verification token refused",
    );

    throw createBadRequestError(spec.invalidTokenError);
  }

  const plan = await spec.plan(token);

  await markUsedAndApply(token, plan.effect, plan.audit);

  return token;
}
