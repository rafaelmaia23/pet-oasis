import type { Request, Response } from "express";
import { uploadedFile } from "@/middlewares/upload.middleware";

/**
 * O que a rota de upload de imagem precisa do **transporte** e a tabela de
 * rotas não descreve: o buffer do arquivo que o `uploadSingleImage` (em
 * `before`) já validou. Mesmo formato de `apps/api/src/modules/auth/auth.transport.ts`
 * — é o `context` que `@/lib/registerRoute` chama por requisição, e o
 * registrador não sabe o que é multipart; ele só espalha o retorno no
 * contexto do handler.
 */
export type ProductTransport = {
  file: Buffer;
};

export const productTransport = (
  req: Request,
  _res: Response,
): ProductTransport => ({
  file: uploadedFile(req),
});
