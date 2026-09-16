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

// D7 (10.2) — o deploy tem um proxy reverso na frente e, desde o front web,
// clientes internos que renderizam no servidor: `req.ip` deve vir do
// X-Forwarded-For que ELES escrevem, senão o rate limit, o lockout e o audit log
// registram o container em vez do visitante.
//
// Por **endereço de origem** e não por contagem de saltos: duas cadeias coexistem
// — visitante→proxy→api, com um salto, e visitante→proxy→cliente→api, com dois —
// e nenhum número único acerta as duas. Assim o Express caminha o header da
// direita para a esquerda pulando os confiáveis e para no primeiro que não é, o
// que também libera o cliente de escolher entre copiar o header ou acrescentar
// o próprio salto (ver docs/guides/integrating-with-the-api.md).
//
// O que torna isto seguro é a porta 3000 **não** ser publicada no host em
// produção (infra/docker-compose.prod.yml): quem alcança a API por endereço
// privado é só o nginx e os containers das redes declaradas. Publicar a porta
// de novo transformaria esta linha num furo.
//
// Limite conhecido: um visitante cujo **próprio** endereço é privado (rede de
// escritório atrás do mesmo nginx, cliente por VPN) é pulado junto com os
// saltos, e o IP registrado passa a ser o do container. É o preço de não poder
// distinguir "salto de infraestrutura" de "visitante em rede privada" só pelo
// endereço — e é aceitável enquanto o público chega pela internet. O dia em que
// houver rede privada legítima do outro lado do proxy, a saída é o nginx
// **reescrever** o header em vez de acrescentar, não afrouxar isto aqui.
app.set("trust proxy", ["loopback", "uniquelocal"]);

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
