import { apiReference } from "@scalar/express-api-reference";

/**
 * UI interativa da API (Scalar), servida em `GET /reference`. Consome o
 * documento público `/openapi.json` (gerado em `openapi.ts`) e carrega o
 * bundle do Scalar via CDN client-side.
 *
 * O "try it" usa o securityScheme bearer do spec (`bearerAuth`): o visitante
 * loga pelo `POST /auth/login`, copia o `accessToken` e cola no campo Bearer.
 */
export const referenceHandler = apiReference({
  url: "/openapi.json",
  pageTitle: "Pet Oasis API — Referência",
  theme: "deepSpace",
  authentication: { preferredSecurityScheme: "bearerAuth" },
});
