import { AppError } from "./AppError";

export const badRequest = (message: string) =>
  new AppError({ message, statusCode: 400, code: "BAD_REQUEST" });

export const notFound = (message: string) =>
  new AppError({ message, statusCode: 404, code: "NOT_FOUND" });

export const unauthorized = (message: string) =>
  new AppError({ message, statusCode: 401, code: "UNAUTHORIZED" });
