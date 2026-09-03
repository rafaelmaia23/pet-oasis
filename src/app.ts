import path from "node:path";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { corsOptions } from "@/config/cors";
import { env } from "@/config/env";
import { helmetOptions } from "@/config/helmet";
import { requestContextMiddleware } from "@/lib/requestContext";
import { accessLog } from "@/middlewares/access-log.middleware";
import { errorHandler } from "@/middlewares/error-handler.middleware";
import { router } from "@/routes";

const app = express();

// D7 — o deploy tem um proxy reverso na frente (ver docs/guides/deploy.md), então
// `req.ip` deve vir do X-Forwarded-For que ELE escreve — é o IP real que o rate
// limit, o lockout e os logs precisam. O `1` é literal: confia em exatamente um
// salto. Sem proxy na frente isto seria um furo (header forjável pelo cliente).
app.set("trust proxy", 1);

// Primeiro de todos: abre o contexto do request (requestId) para que qualquer
// log emitido daqui em diante — inclusive de dentro de um middleware que
// rejeite o request — saia correlacionado.
app.use(requestContextMiddleware);

// Access log — logo depois do contexto, para toda request logar (inclusive as
// recusadas pelo CORS ou pelo limite de corpo).
app.use(accessLog);

// Headers de segurança; a CSP é a do helmet, endurecida (ver config/helmet.ts).
// A folga que a UI do Scalar exige está escopada em `/reference`.
app.use(helmet(helmetOptions));
app.use(cors(corsOptions));

/**
 * Estático das imagens (9.10/AA2). O ADR pressupunha que o reverse proxy
 * serviria `/uploads/*` sem passar por Node — e ele existe, mas **fora deste
 * repositório**, no servidor onde a demo é hospedada. Servir aqui é o que
 * mantém **um caminho só** em dev, test e produção: a alternativa (Node em dev,
 * nginx em produção) criaria a classe de bug "funciona em dev, 404 no deploy".
 *
 * A troca é config, não código: o volume é bind mount, então o dia em que o
 * tráfego justificar basta um `location /uploads/ { alias ...; }` no nginx e
 * ajustar `UPLOAD_PUBLIC_BASE_URL`. Nada gravado no banco muda — ele guarda a
 * chave, nunca a URL.
 *
 * `immutable`: o nome do arquivo é um uuid que geramos e o conteúdo nunca é
 * reescrito (trocar a foto grava uma chave nova e apaga a antiga), então
 * revalidar seria gasto puro. O `nosniff` que protege o conteúdo servido vem do
 * helmet, acima — e o pipeline só grava WebP que nós mesmos codificamos.
 */
app.use(
  "/uploads",
  express.static(path.resolve(env.UPLOAD_DIR), {
    index: false,
    dotfiles: "ignore",
    maxAge: "365d",
    immutable: true,
  }),
);

app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
app.use(cookieParser());
app.use(router);
app.use(errorHandler);

export default app;
