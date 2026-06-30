import type { Request, Response } from "express";
import { asyncHandler } from "@/utils/asyncHandler";
import { userPresenter } from "../user/user.presenter";
import { loginSchema, signupSchema } from "./auth.schema";
import * as authService from "./auth.service";

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { body } = signupSchema.parse({ body: req.body });

  const result = await authService.signup(body);

  res.status(201).json(userPresenter.present(result, "owner"));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { body } = loginSchema.parse({ body: req.body });

  const token = req.headers.authorization?.split(" ")[1];

  const result = await authService.login(body, token);

  res.status(200).json(result);
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Token de autenticação ausente ou inválido",
      code: "AUTH_TOKEN_MISSING",
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({
      message: "Token de autenticação ausente ou inválido",
      code: "AUTH_TOKEN_MISSING",
    });
    return;
  }

  await authService.logout(token);

  res.status(204).send();
});
