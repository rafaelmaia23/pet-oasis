export type AppErrorParams = {
  message?: string;
  statusCode?: number;
  cause?: unknown;
  action?: string;
  code?: string;
};

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly cause?: unknown | undefined;
  public readonly action?: string | undefined;
  public readonly code?: string | undefined;
  public readonly isOperational = true;

  constructor({
    message = "Unexpected error",
    statusCode = 500,
    cause,
    action,
    code,
  }: AppErrorParams) {
    super(message, { cause });
    this.name = this.constructor.name;

    this.statusCode = statusCode;
    this.cause = cause;
    this.action = action;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);
  }

  toJson() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      cause: this.cause,
      action: this.action,
      code: this.code,
    };
  }
}
