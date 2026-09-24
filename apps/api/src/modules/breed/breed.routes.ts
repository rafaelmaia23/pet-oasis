import { routes } from "@pet-oasis/api-contracts/routes";
import { Router } from "express";
import { catalogIpLimiter, rateLimitByIp } from "@/lib/rateLimit";
import { registerRoute } from "@/lib/registerRoute";
import { listBreeds } from "./breed.controller";

const breedRouter = Router();

// Rota **pública**, sem `authenticate` e sem `canAccess` (9.1): a vitrine do
// catálogo responde sem token, e não existe feature de leitura pública para
// conceder. Montada no bloco PÚBLICAS de `src/routes/index.ts`.
//
// O limiter por IP entrou na 9.6, junto com as demais rotas de catálogo: esta
// subiu na 9.3 descoberta (risco baixo e assumido — lista estática e pequena),
// e o balde é compartilhado com elas de propósito.
registerRoute(breedRouter, routes.breed.list, {
  before: [rateLimitByIp(catalogIpLimiter, "catalog-read")],
  handler: listBreeds,
});

export default breedRouter;
