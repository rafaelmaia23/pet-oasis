/**
 * Taxonomia fechada de ações de auditoria (docs/logging-policy.md §4.3).
 *
 * `SCREAMING_SNAKE`, no formato `RECURSO_ACAO_NO_PASSADO` — o audit registra o
 * que **já aconteceu**. A lista é a fonte única: nenhuma ação nasce fora dela
 * (§4.1.3). Fechá-la como union em tempo de compilação — no idioma de
 * `FeatureName`/`RoleName` — evita uma migration a cada ação nova.
 *
 * Declaradas mesmo antes de cada ponto ser ligado — evita reabrir este
 * arquivo a cada sub-fase nova. `DEMO_RESET_EXECUTED` (7.14) é a mais
 * recente; forçar senha/troca de email (Sessão H) ainda não têm call site.
 */
export const AUDIT_ACTIONS = [
  "AUTH_LOGIN_FAILED",
  "AUTH_LOCKOUT_TRIGGERED",
  "AUTH_LOCKOUT_CLEARED",
  "AUTH_RATE_LIMIT_EXCEEDED",
  "USER_CREATED",
  "USER_DELETED",
  // Deleção de um perfil (não da conta). Passou a ser registrada na 8.1 (K8)
  // porque, com a cascata, ela derruba roles e overrides — inclusive
  // privilegiados — sem nada disso aparecer na resposta 204.
  "USER_PROFILE_DELETED",
  "USER_BANNED",
  "USER_UNBANNED",
  "USER_ROLE_GRANTED",
  "USER_ROLE_REVOKED",
  "USER_PERMISSION_GRANTED",
  "USER_PERMISSION_REVOKED",
  // Override privilegiado que **não** ressuscitou porque o ator não é admin
  // (D16). O descarte é permanente e invisível na resposta HTTP — sem esta
  // linha, ninguém fica sabendo que a permissão foi perdida.
  "USER_PERMISSION_RESTORE_SKIPPED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FORCED",
  "EMAIL_CHANGE_REQUESTED",
  "EMAIL_CHANGE_COMPLETED",
  "DEMO_RESET_EXECUTED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** O tipo de recurso sobre o qual a ação incidiu. */
export type AuditTargetType = "User" | "Route" | "System";
