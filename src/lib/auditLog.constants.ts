/**
 * Taxonomia fechada de ações de auditoria (docs/logging-policy.md §4.3).
 *
 * `SCREAMING_SNAKE`, no formato `RECURSO_ACAO_NO_PASSADO` — o audit registra o
 * que **já aconteceu**. A lista é a fonte única: nenhuma ação nasce fora dela
 * (§4.1.3). Fechá-la como union em tempo de compilação — no idioma de
 * `FeatureName`/`RoleName` — evita uma migration a cada ação nova.
 *
 * As 18 estão declaradas mesmo que a sub-fase 7.6 ligue só 12 pontos; as 6
 * restantes (lockout, rate limit, forçar senha, troca de email, demo-reset) são
 * ligadas nas suas próprias sub-fases (E, H, G) e já validam desde agora.
 */
export const AUDIT_ACTIONS = [
  "AUTH_LOGIN_FAILED",
  "AUTH_LOCKOUT_TRIGGERED",
  "AUTH_LOCKOUT_CLEARED",
  "AUTH_RATE_LIMIT_EXCEEDED",
  "USER_CREATED",
  "USER_DELETED",
  "USER_BANNED",
  "USER_UNBANNED",
  "USER_ROLE_GRANTED",
  "USER_ROLE_REVOKED",
  "USER_PERMISSION_GRANTED",
  "USER_PERMISSION_REVOKED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FORCED",
  "EMAIL_CHANGE_REQUESTED",
  "EMAIL_CHANGE_COMPLETED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** O tipo de recurso sobre o qual a ação incidiu. */
export type AuditTargetType = "User" | "Route" | "System";
