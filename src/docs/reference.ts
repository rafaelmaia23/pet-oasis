import { apiReference } from "@scalar/express-api-reference";

/**
 * UI interativa da API (Scalar), servida em `GET /reference`. Consome o
 * documento público `/openapi.json` (gerado em `openapi.ts`) e carrega o
 * bundle do Scalar via CDN client-side.
 *
 * O "try it" usa o securityScheme bearer do spec (`bearerAuth`): o visitante
 * loga pelo `POST /auth/login` com o usuário demo (credenciais na introdução
 * do spec), copia o `accessToken` e cola no campo Bearer.
 *
 * O favicon é um data-URI porque o projeto não serve arquivos estáticos —
 * apontar para `/favicon.ico` exigiria montar `express.static` só para isso.
 */
export const referenceHandler = apiReference({
  url: "/openapi.json",
  pageTitle: "Pet Oasis API — Referência",
  theme: "deepSpace",
  authentication: { preferredSecurityScheme: "bearerAuth" },
  favicon:
    "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐾</text></svg>",
  metaData: {
    title: "Pet Oasis API — Referência",
    description:
      "API REST de pet shop com autenticação JWT + refresh rotativo, RBAC " +
      "com overrides e 330+ testes. Documentação interativa com usuário " +
      "demo — teste sem instalar nada.",
    ogTitle: "Pet Oasis API — Referência interativa",
    ogDescription:
      "Logue com o usuário demo e veja o RBAC decidindo ao vivo: 200 na " +
      "leitura, 403 na escrita.",
  },
});
