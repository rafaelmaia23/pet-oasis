/**
 * Taxonomia fechada de ações de auditoria (docs/reference/logging-policy.md §4.3).
 *
 * `SCREAMING_SNAKE`, no formato `RECURSO_ACAO_NO_PASSADO` — o audit registra o
 * que **já aconteceu**. A lista é a fonte única: nenhuma ação nasce fora dela
 * (§4.1.3). Fechá-la como union em tempo de compilação — no idioma de
 * `FeatureName`/`RoleName` — evita uma migration a cada ação nova.
 *
 * Declaradas mesmo antes de cada ponto ser ligado — evita reabrir este
 * arquivo a cada sub-fase nova. As mais recentes são o par de reativação de
 * conta (8.4/8.5); hoje todas as ações da lista têm call site.
 */
export const AUDIT_ACTIONS = [
  "AUTH_LOGIN_FAILED",
  "AUTH_LOCKOUT_TRIGGERED",
  "AUTH_LOCKOUT_CLEARED",
  "AUTH_RATE_LIMIT_EXCEEDED",
  // Acerto da janela de graça (10.7): o mesmo refresh voltou dentro da janela e
  // a API devolveu o par que já tinha emitido. Informativo — quem investiga
  // roubo procura o `warn` do reuso fora da janela, e diluir os dois numa ação
  // só faria a concorrência rotineira de um cliente enterrar o sinal.
  "AUTH_REFRESH_GRACE_SERVED",
  "USER_CREATED",
  "USER_DELETED",
  // Perfil (não a conta). Criação e restauração entraram na 8.3; a deleção,
  // na 8.1 (K8), porque com a cascata ela derruba roles e overrides —
  // inclusive privilegiados — sem nada disso aparecer na resposta 204.
  "USER_PROFILE_CREATED",
  "USER_PROFILE_RESTORED",
  "USER_PROFILE_DELETED",
  "USER_BANNED",
  "USER_UNBANNED",
  "USER_ROLE_GRANTED",
  "USER_ROLE_REVOKED",
  "USER_PERMISSION_GRANTED",
  "USER_PERMISSION_REVOKED",
  // Reativação de conta soft-deletada (8.4/8.5). O pedido e a confirmação são
  // ações separadas porque acontecem em momentos e por atores diferentes: quem
  // pede é o signup ou um admin; quem confirma é o dono da conta, com o token.
  "ACCOUNT_REACTIVATION_REQUESTED",
  "ACCOUNT_REACTIVATION_COMPLETED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_CHANGED",
  "PASSWORD_CHANGE_FORCED",
  "EMAIL_CHANGE_REQUESTED",
  "EMAIL_CHANGE_COMPLETED",
  "DEMO_RESET_EXECUTED",
  // Pet (9.4). O nome do pet **não** entra na metadata de nenhuma delas — não
  // por ser PII do pet, mas porque nome de pet é resposta clássica de pergunta
  // de segurança e componente de senha; e porque "só ids e enums" só vale se
  // não for flexibilizada caso a caso (§4.4 da política).
  "PET_CREATED",
  "PET_UPDATED",
  "PET_DELETED",
  "PET_DECEASED",
  // Taxonomia do catálogo (9.6). Reorganizar a árvore reclassifica a loja
  // inteira — por isso `manage:catalog-structure` é feature separada da autoria
  // de produto, e por isso as três escritas são auditadas. A metadata leva id e
  // (na categoria) o `parentId`, nunca o nome: "só ids e enums" (§4.4).
  "BRAND_CREATED",
  "BRAND_UPDATED",
  "BRAND_DELETED",
  "CATEGORY_CREATED",
  "CATEGORY_UPDATED",
  "CATEGORY_DELETED",
  "TAG_CREATED",
  "TAG_UPDATED",
  // Hard delete (9.6/W5) — a linha some, então o audit é o único registro de
  // que a tag existiu.
  "TAG_DELETED",
  // Produto e variante (9.7). A metadata leva ids, contagens e nomes de campo —
  // nunca o nome comercial nem a descrição: "só ids e enums" (§4.4 da política).
  "PRODUCT_CREATED",
  "PRODUCT_UPDATED",
  "PRODUCT_DELETED",
  "PRODUCT_VARIANT_CREATED",
  "PRODUCT_VARIANT_UPDATED",
  "PRODUCT_VARIANT_DELETED",
  // Ajuste de estoque tem linha própria porque é outro ato: outra feature
  // (`manage:stock`, 9.7/X4), outro cargo (o repositor conta prateleira sem
  // poder editar o catálogo) e outra pergunta na auditoria ("quem mexeu no
  // estoque?"). Metadata leva `from`/`to` — números, não PII.
  "PRODUCT_STOCK_ADJUSTED",
  // Imagem (9.10/AA17). O `targetType` é o **dono** (`Product`/`Pet`/`Brand`),
  // com o `imageId` na metadata: alvo novo no enum só se paga quando alguém vai
  // filtrar por ele em `GET /audit-logs`, e a pergunta de auditoria é "o que
  // aconteceu com este produto?", não "com esta imagem?".
  //
  // A linha de imagem é hard delete (AA16), então — como na tag — o audit é o
  // único registro de que ela existiu.
  "PRODUCT_IMAGE_UPLOADED",
  "PRODUCT_IMAGE_DELETED",
  "PRODUCT_IMAGES_REORDERED",
  "PET_PHOTO_UPDATED",
  "PET_PHOTO_DELETED",
  "BRAND_LOGO_UPDATED",
  "BRAND_LOGO_DELETED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * O tipo de recurso sobre o qual a ação incidiu.
 *
 * Lista const e não union escrita à mão porque o filtro `?targetType=` de
 * `GET /audit-logs` precisa dela em runtime: enquanto eram duas declarações
 * separadas, acrescentar um alvo exigia lembrar de editar as duas, e esquecer
 * o schema não quebrava o build — só sumia silenciosamente com o filtro.
 */
export const AUDIT_TARGET_TYPES = [
  "User",
  "Pet",
  "Brand",
  "Category",
  "Tag",
  "Product",
  "ProductVariant",
  "Route",
  "System",
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];
