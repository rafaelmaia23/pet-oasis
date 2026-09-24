import type { Request, Response } from "express";
import { uploadedFile } from "@/middlewares/upload.middleware";

/**
 * O que `PUT /pets/:petId/photo` precisa do **transporte** e a tabela de rotas
 * não descreve: o arquivo que o `multer` (em `before`, via `uploadSingleImage`)
 * já leu para `req.file`. O registrador não sabe o que é um upload — ele chama
 * esta função depois do `before` e do parse do envelope, e espalha o retorno
 * no contexto do handler (ver `RouteRegistration.context` em
 * `@/lib/registerRoute`).
 */
export type PetPhotoTransport = { file: Buffer };

export const petPhotoTransport = (
  req: Request,
  _res: Response,
): PetPhotoTransport => ({
  file: uploadedFile(req),
});
