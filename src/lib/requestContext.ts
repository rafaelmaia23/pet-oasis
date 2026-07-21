import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export type RequestContext = {
  requestId: string;
  actorId?: string;
  ip?: string;
  userAgent?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Header pelo qual o id entra (de um proxy/cliente) e volta ao cliente. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Contexto de observabilidade do request corrente.
 *
 * **Exceção consciente** ao "explicit over implicit" do projeto (registrada em
 * `docs/context.md` §2.2 e na política §6): correlacionar as três categorias de
 * log exige um `requestId` disponível em qualquer camada, e a alternativa
 * explícita seria arrastar um `context` por dezenas de assinaturas de service
 * para entregar um valor usado só no fundo da pilha. O escopo é estrito:
 * **nenhuma regra de negócio lê daqui** — só logger e audit log.
 *
 * Fora de um request (boot, scripts, seed) o store não existe e as funções
 * degradam para `undefined`/no-op.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn);
}

/** Preenchido pelo `authenticate` depois de validar o JWT. */
export function setActorId(actorId: string): void {
  const context = storage.getStore();
  if (context) context.actorId = actorId;
}

/**
 * Primeiro middleware da cadeia: abre o store e devolve o `requestId` no
 * header, para quem reporta um problema poder citá-lo.
 */
export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const requestId =
    (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();

  res.setHeader(REQUEST_ID_HEADER, requestId);

  runWithRequestContext(
    {
      requestId,
      ...(req.ip ? { ip: req.ip } : {}),
      ...(req.headers["user-agent"]
        ? { userAgent: req.headers["user-agent"] }
        : {}),
    },
    next,
  );
}
