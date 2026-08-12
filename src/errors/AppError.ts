export type AppErrorParams = {
  message?: string;
  statusCode?: number;
  cause?: unknown;
  action?: string;
  code?: string;
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
  public readonly code?: string | undefined;
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

  toJson() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      action: this.action,
      code: this.code,
    };
  }
}
