export const REFRESH_TOKEN_COOKIE_NAME = "refresh_token";
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias, deslizante
export const REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth";

/**
 * Janela de graça da rotação (10.7): por quanto tempo o par já emitido é
 * devolvido de novo a quem reapresenta o mesmo refresh token.
 *
 * Constante nomeada, deliberadamente **não** uma env var. Concorrência real
 * (duas abas, um prefetch) resolve em menos de um segundo; 30s já seria tempo
 * em que um token capturado de log de proxy é usável. Número que ninguém deve
 * ajustar em produção sem pensar não merece um botão.
 */
export const REFRESH_GRACE_WINDOW_MS = 10 * 1000;

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hora

export const ACCOUNT_REACTIVATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
