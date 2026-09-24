import type { Request, Response } from "express";
import {
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "./auth.refreshCookie";

/**
 * O que as rotas de auth precisam do **transporte** e a tabela de rotas não
 * descreve: o refresh token que o cliente apresentou, o poder de emitir e de
 * limpar o dele, e de onde a sessão está sendo aberta.
 *
 * É o `context` que `@/lib/registerRoute` chama por requisição (ver
 * `RouteRegistration.context`). O registrador não sabe o que é um cookie: ele
 * chama esta função e espalha o que vier no contexto do handler. E o handler,
 * do outro lado, nunca vê `req` nem `res` — só estas quatro coisas, nomeadas
 * pelo que fazem.
 *
 * Este é o **único** ponto do caminho da rota que alcança
 * `auth.refreshCookie.ts`. Os atributos, o path e o prazo do cookie continuam
 * sendo decididos lá, num lugar só (issue 04 de
 * `.scratch/fase-12-module-depth/`) — aqui não há política nenhuma, só a
 * ligação entre o módulo do cookie e o handler.
 */
export type AuthTransport = {
  /**
   * O refresh token que veio no cookie, se veio algum. Ausência e valor não
   * textual são a mesma coisa — quem decide isso é `readRefreshCookie`.
   */
  presentedRefreshToken: string | undefined;
  /** Emite (ou rotaciona) o refresh token na resposta. */
  issueRefreshToken: (refreshToken: string) => void;
  /** Apaga o refresh token do navegador. */
  clearRefreshToken: () => void;
  /** De onde a sessão está sendo aberta — o que `Session` grava. */
  client: { userAgent: string | undefined; ipAddress: string | undefined };
};

export const authTransport = (req: Request, res: Response): AuthTransport => ({
  presentedRefreshToken: readRefreshCookie(req),
  issueRefreshToken: (refreshToken) => setRefreshCookie(res, refreshToken),
  clearRefreshToken: () => clearRefreshCookie(res),
  client: { userAgent: req.headers["user-agent"], ipAddress: req.ip },
});
