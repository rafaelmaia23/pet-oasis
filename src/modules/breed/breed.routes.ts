import { Router } from "express";
import * as breedController from "./breed.controller";

const breedRouter = Router();

// Rota **pública**, sem `authenticate` e sem `canAccess` (9.1): a vitrine do
// catálogo responde sem token, e não existe feature de leitura pública para
// conceder. Montada no bloco PÚBLICAS de `src/routes/index.ts`.
breedRouter.get("/", breedController.listBreeds);

export default breedRouter;
