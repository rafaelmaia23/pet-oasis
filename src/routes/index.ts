import { Router } from "express";
import { buildOpenApiDocument } from "@/docs/openapi";
import {
  docsCsp,
  docsCspNonce,
  referenceHandler,
  SCALAR_BUNDLE_PATH,
  scalarBundleFile,
} from "@/docs/reference";
import {
  authenticate,
  optionalAuthenticate,
} from "@/middlewares/authenticate.middleware";
import auditLogRouter from "@/modules/audit-log/audit-log.routes";
import authRouter from "@/modules/auth/auth.routes";
import brandRouter from "@/modules/brand/brand.routes";
import breedRouter from "@/modules/breed/breed.routes";
import categoryRouter from "@/modules/category/category.routes";
import featureRouter from "@/modules/feature/feature.routes";
import logRouter from "@/modules/log/log.routes";
import meRouter from "@/modules/me/me.routes";
import permissionRouter from "@/modules/permission/permission.routes";
import petCustomerRouter from "@/modules/pet/pet.customer.routes";
import petRouter from "@/modules/pet/pet.routes";
import productRouter from "@/modules/product/product.routes";
import variantRouter from "@/modules/product/product.variant.routes";
import roleRouter from "@/modules/role/role.routes";
import statusRouter from "@/modules/status/status.routes";
import tagRouter from "@/modules/tag/tag.routes";
import userProfileRouter from "@/modules/user/profile/user.profile.routes";
import userRouter from "@/modules/user/user.routes";

const v1Router = Router();

// PÚBLICAS — sem authenticate
v1Router.use("/status", statusRouter);
v1Router.use("/auth", authRouter);
// Vitrine do catálogo (9.1): responde sem token porque o e-commerce vive de
// quem chega pelo Google sem conta. `/breeds` fica aqui, seco: é só leitura, não
// tem escrita nem view por capability, então não precisa nem identificar o ator.
v1Router.use("/breeds", breedRouter);

// PÚBLICAS COM AUTENTICAÇÃO OPCIONAL (9.6) — leem sem token, escrevem com
// feature. O middleware identifica o ator quando o `Bearer` vem e segue anônimo
// quando não vem (ou quando o token é ruim), sem nunca responder 401; quem
// exige identidade é o `canAccess` das rotas de escrita, dentro de cada router.
// A 9.8 depende do mesmo middleware para escolher a view de `/products`.
v1Router.use("/brands", optionalAuthenticate, brandRouter);
v1Router.use("/categories", optionalAuthenticate, categoryRouter);
v1Router.use("/tags", optionalAuthenticate, tagRouter);
// Produto entra aqui já na 9.7, que só tem escrita: a vitrine da 9.8 acrescenta
// o `GET` sem remontar o router, e o 401 da escrita continua vindo do
// `canAccess`. `/variants` fica do lado protegido — variante não tem leitura
// pública própria, ela aparece dentro do produto.
v1Router.use("/products", optionalAuthenticate, productRouter);

// PROTEGIDAS — com authenticate
v1Router.use("/me", authenticate, meRouter);
v1Router.use("/users", authenticate, userRouter);
v1Router.use("/users/:userId", authenticate, userProfileRouter);
v1Router.use("/users/:userId", authenticate, permissionRouter);
// Pet (9.4): coleção aninhada no cliente, recurso plano no item. As duas
// exigem token — a vitrine pública é do catálogo, não da ficha do pet.
v1Router.use("/customers/:customerId", authenticate, petCustomerRouter);
v1Router.use("/pets", authenticate, petRouter);
v1Router.use("/variants", authenticate, variantRouter);
v1Router.use("/features", authenticate, featureRouter);
v1Router.use("/roles", authenticate, roleRouter);
v1Router.use("/audit-logs", authenticate, auditLogRouter);
v1Router.use("/logs", authenticate, logRouter);

export const router = Router();

// Documentação — pública, fora dos grupos protegidos por `authenticate`
router.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiDocument());
});
router.use("/reference", docsCspNonce, docsCsp, referenceHandler);

// Bundle do Scalar servido pela própria origem (D3) — imutável por versão do
// pacote, então cache longo. Sem isto, a CSP `script-src 'self'` bloquearia a UI.
router.get(SCALAR_BUNDLE_PATH, (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.sendFile(scalarBundleFile);
});

router.use("/api/v1", v1Router);
