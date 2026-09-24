import { Router } from "express";
import { buildOpenApiDocument } from "@/docs/openapi";
import {
  docsCsp,
  docsCspNonce,
  referenceHandler,
  SCALAR_BUNDLE_PATH,
  scalarBundleFile,
  scalarBundleRoot,
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
//
// Os routers **sem prefixo** são os que já passaram pelo `registerRoute`: o
// path inteiro vem da entrada da tabela de rotas, então montá-los num prefixo
// o duplicaria. Enquanto a migração corre (issues 08–15 de
// `.scratch/fase-12-module-depth/`), as duas formas convivem aqui.
v1Router.use(statusRouter);
v1Router.use(authRouter);
// Vitrine do catálogo (9.1): responde sem token porque o e-commerce vive de
// quem chega pelo Google sem usuário. `/breeds` fica aqui, seco: é só leitura, não
// tem escrita nem view por feature efetiva, então não precisa nem identificar o ator.
v1Router.use(breedRouter);

// PÚBLICAS COM AUTENTICAÇÃO OPCIONAL (9.6) — leem sem token, escrevem com
// feature. O middleware identifica o ator quando o `Bearer` vem e segue anônimo
// quando não vem (ou quando o token é ruim), sem nunca responder 401; quem
// exige identidade é o `canAccess` das rotas de escrita, dentro de cada router.
// A 9.8 depende do mesmo middleware para escolher a view de `/products`.
v1Router.use("/brands", optionalAuthenticate, brandRouter);
v1Router.use("/categories", optionalAuthenticate, categoryRouter);
v1Router.use("/tags", optionalAuthenticate, tagRouter);
// Produto (e a criação de variante, aninhada nele) já sai inteiro pelo
// `registerRoute` (issue 14) — `optionalAuthenticate` desceu para o `before`
// de cada rota que precisa dele. `/variants` fica do lado protegido —
// variante não tem leitura pública própria, ela aparece dentro do produto.
v1Router.use(productRouter);

// PROTEGIDAS — com authenticate
//
// Nos routers secos o `authenticate` não está aqui: ele desceu do prefixo para
// o `before` de cada rota, onde a entrada da tabela o exige — ver
// `src/modules/role/role.routes.ts`. Consequência decidida em
// `../../docs/adr/0203-authenticate-desce-do-grupo-para-rota-404-vence-401.md`.
v1Router.use(meRouter);
v1Router.use(userRouter);
v1Router.use(userProfileRouter);
v1Router.use(permissionRouter);
// Pet (9.4): coleção aninhada no cliente, recurso plano no item. As duas
// exigem token — a vitrine pública é do catálogo, não da ficha do pet.
v1Router.use("/customers/:customerId", authenticate, petCustomerRouter);
v1Router.use("/pets", authenticate, petRouter);
v1Router.use(variantRouter);
v1Router.use(featureRouter);
v1Router.use(roleRouter);
v1Router.use(auditLogRouter);
v1Router.use(logRouter);

export const router = Router();

// Documentação — pública, fora dos grupos protegidos por `authenticate`
router.get("/openapi.json", (_req, res) => {
  res.json(buildOpenApiDocument());
});
router.use("/reference", docsCspNonce, docsCsp, referenceHandler);

// Bundle do Scalar servido pela própria origem (D3) — imutável por versão do
// pacote, então cache longo. Sem isto, a CSP `script-src 'self'` bloquearia a UI.
// `root` separado do arquivo por causa do `.pnpm` no caminho real — ver
// `scalarBundleRoot`.
router.get(SCALAR_BUNDLE_PATH, (_req, res) => {
  res.type("application/javascript");
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");
  res.sendFile(scalarBundleFile, { root: scalarBundleRoot });
});

router.use("/api/v1", v1Router);
