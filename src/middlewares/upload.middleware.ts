import type { NextFunction, Request, Response } from "express";
import multer, { MulterError } from "multer";
import { env } from "@/config/env";
import { createPayloadTooLargeError, createValidationError } from "@/errors";

/**
 * Borda do multipart (9.10/AA3). **`memoryStorage`, um arquivo por request**:
 *
 * - em memória, o byte só toca o disco depois de o pipeline aprovar o arquivo,
 *   e recusar não deixa temporário para trás. `diskStorage` grava antes de
 *   saber se o arquivo presta;
 * - um arquivo por request porque a falha parcial de um lote não tem boa saída
 *   (ou o cliente perde os que já subiram, ou a API inventa um status misto que
 *   só este endpoint usa). O front continua deixando o usuário escolher oito
 *   fotos num gesto só — ele dispara oito requests, e ganha barra de progresso e
 *   retry **por imagem** (AA4).
 *
 * O teto de tamanho é do multer, não do `express.json`: `JSON_BODY_LIMIT` só
 * age em `application/json` e não tem efeito nenhum aqui — é a primeira coisa
 * que alguém vai culpar erradamente quando um upload de 3 MB falhar por outro
 * motivo.
 */
const handler = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_SIZE_BYTES,
    files: 1,
  },
}).single("file");

export function uploadSingleImage(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  handler(req, res, (error: unknown) => {
    if (error instanceof MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(
          createPayloadTooLargeError({
            message: "Imagem maior que o tamanho máximo permitido",
            action: `Envie um arquivo de até ${Math.floor(
              env.UPLOAD_MAX_FILE_SIZE_BYTES / (1024 * 1024),
            )} MB`,
          }),
        );
        return;
      }

      // Campo errado, arquivo a mais: erro do cliente sobre a forma do corpo,
      // que é a definição de 422 neste projeto.
      next(
        createValidationError({
          errors: { file: ['Envie exatamente um arquivo no campo "file"'] },
        }),
      );
      return;
    }

    if (error) {
      next(error);
      return;
    }

    if (!req.file) {
      next(
        createValidationError({
          errors: { file: ['Envie um arquivo no campo "file"'] },
        }),
      );
      return;
    }

    next();
  });
}
