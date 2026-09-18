import type { Request, Response } from "express";
import { getAuthUser } from "@/utils/getAuthUser";
import { mePresenter } from "./me.presenter";
import * as meService from "./me.service";

export const getMe = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const me = await meService.getMe(authUser);
  res.status(200).json(mePresenter.present(me, "default"));
};
