import type { ErrorCode, ErrorResponse } from "@pet-oasis/api-contracts/errors";

/**
 * O envelope do contrato como a **API** o emite: o `ErrorResponse` com o `code`
 * estreitado ao enum e sem o `requestId`.
 *
 * As duas diferenças são deliberadas. O `code` do contrato é `string` aberta de
 * propósito — um code novo da API não pode fazer o parse do cliente falhar —,
 * mas quem *emite* não tem essa liberdade: aqui o enum é fechado. E o
 * `requestId` fica de fora porque quem o acrescenta é o ponto único de saída,
 * que é quem tem o contexto do request.
 */
export type AppErrorJson = Omit<ErrorResponse, "requestId" | "code"> & {
  code?: ErrorCode | undefined;
};

export type AppErrorParams = {
  message?: string;
  statusCode?: number;
  cause?: unknown;
  action?: string;
  /**
   * O identificador estável em que o cliente ramifica. O tipo é o `ErrorCode`
   * do contrato porque o vocabulário de erro tem **um** dono: um code fora do
   * enum de `@pet-oasis/api-contracts/errors` não compila. A fronteira é a de
   * `docs/adr/0095-fronteira-featurename-string.md` — aqui se digita o
   * literal, então aqui o tipo estreito vale.
   */
  code?: ErrorCode;
  /**
   * Headers de resposta que este erro exige (ex.: `Retry-After` no 429). Vivem
   * no erro, e não em `res.set`, porque quem lança pode não ter `res` à mão —
   * o error handler central é o ponto único que aplica.
   */
  headers?: Record<string, string>;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly cause?: unknown | undefined;
  public readonly action?: string | undefined;
  public readonly code?: ErrorCode | undefined;
  public readonly headers?: Record<string, string> | undefined;
  public readonly isOperational = true;

  constructor({
    message = "Unexpected error",
    statusCode = 500,
    cause,
    action,
    code,
    headers,
  }: AppErrorParams) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.cause = cause;
    this.action = action;
    this.code = code;
    this.headers = headers;
    Error.captureStackTrace(this, this.constructor);
  }

  toJson(): AppErrorJson {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      action: this.action,
      code: this.code,
    };
  }
}
