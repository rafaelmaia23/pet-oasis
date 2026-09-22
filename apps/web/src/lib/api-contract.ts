/**
 * A fiação do contrato no web, provada em tempo de tipo.
 *
 * Este módulo **não** é o cliente HTTP — esse é a Fase 12, e está descrito em
 * `.scratch/fase-12-web-auth-spine/issues/03-api-client-and-e2e-harness.md`.
 * Ele existe para o que a Fase 11 foi feita: o web lê o contrato do mesmo lugar
 * onde a API o escreve (`@pet-oasis/api-contracts`, por `workspace:*`), então
 * renomear um campo de uma view ou de um schema de request quebra o `typecheck`
 * do web **no mesmo PR** — nunca em runtime, nunca depois do deploy.
 *
 * As três pontas que o contrato tem estão representadas aqui de propósito, uma
 * por export: um schema de **request**, uma **view** de resposta e a **tabela
 * de rotas**. Some uma delas e a prova deixa de cobrir aquela ponta.
 */
import { loginSchema } from "@pet-oasis/api-contracts/auth";
import type { FeatureName } from "@pet-oasis/api-contracts/feature";
import type { meViews } from "@pet-oasis/api-contracts/me";
import { routes } from "@pet-oasis/api-contracts/routes";
import type { z } from "zod";

/**
 * O corpo que `POST /auth/login` aceita — exatamente o que a API valida. Sai de
 * `loginSchema.shape.body`, a mesma via que o `parseLoginForm` usa abaixo: o
 * envelope do contrato é `z.object({ body })`, e chegar ao corpo por dois
 * caminhos diferentes no mesmo arquivo é uma via a mais para envelhecer.
 */
export type LoginBody = z.infer<typeof loginSchema.shape.body>;

/**
 * O que `GET /me` devolve. Entra **só como tipo**: resposta da API não passa
 * por `.parse()` — ela é a autoridade do contrato (ADR-0003 do web).
 */
export type Me = z.infer<typeof meViews.default>;

/**
 * Valida o formulário de login antes de enviar, com o schema de request do
 * contrato. É conveniência de UX: a validação que decide continua sendo a da
 * API, que recusa no mesmo shape (422 por campo).
 */
export function parseLoginForm(input: unknown) {
  return loginSchema.shape.body.safeParse(input);
}

/**
 * Os nomes dos campos do formulário de login — os mesmos `name=` que a tela da
 * Fase 12 vai escrever nos inputs. Estão amarrados a `keyof LoginBody` de
 * propósito: `safeParse` recebe `unknown`, então sozinho ele não notaria um
 * campo renomeado no contrato. É esta linha que faz a ponta do **request** ser
 * tão load-bearing quanto as outras duas.
 */
export const LOGIN_FIELDS = [
  "email",
  "password",
] as const satisfies readonly (keyof LoginBody)[];

/**
 * As features efetivas de quem está logado, lidas da view `me`. É por este
 * campo que a Fase 12 esconde afordância — aqui ele prova que o tipo da
 * resposta é o do contrato, e não uma cópia.
 *
 * Devolve `FeatureName`, não `string`: o nome de feature atravessa a rede como
 * o enum do catálogo (11.18), então `can(me, "raed:pet")` não compila. O
 * wildcard `*` é um nome do catálogo como os outros — quem o ignorar esconde
 * tudo do admin.
 */
export function featuresOf(me: Me): readonly FeatureName[] {
  return me.features;
}

/**
 * Verbo e path de `GET /me`, tirados da tabela de rotas. Nenhum path é escrito
 * à mão no web: o path na forma do Express (`/users/:id`) é do contrato, e quem
 * substitui `:param` pela URL final é o `apiFetch` da Fase 12.
 */
export const meEndpoint = {
  method: routes.me.get.method,
  path: routes.me.get.path,
} as const;
