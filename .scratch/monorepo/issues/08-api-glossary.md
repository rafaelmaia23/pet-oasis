# 08: Glossário da API (`CONTEXT.md`)

**What to build:** `apps/api/CONTEXT.md` existe como **glossário puro** do contexto da API —
cada termo do domínio (User, Customer, Employee, Role, Feature, override, perfil, sessão,
Product, ProductVariant, Category, Tag, Brand, Pet, PetSpecies, soft delete, reativação,
banimento, lockout…) com a definição de uma ou duas linhas e os termos a evitar —, no formato
da skill, sem racional, sem implementação. O *porquê* continua nos ADRs da API (um por decisão,
índice em `apps/api/docs/adr/README.md` — o `docs/context/` foi migrado inteiro na 07).

**Blocked by:** 07.

**Status:** fechada em 2026-09-19

- [x] O arquivo segue o formato de `CONTEXT-FORMAT.md` da skill `domain-modeling` (seções
      `Language`, termos em negrito, `_Avoid_`), como o do web já faz — 58 termos em oito grupos
      (identidade, sessão, autorização, ciclo de vida, pets, catálogo, superfície e views,
      auditoria).
- [x] Todo termo é **destilado** dos ADRs existentes (`apps/api/docs/adr/`) — nenhum termo novo
      é inventado; termo que o código chama de um nome e a doc de outro é resolvido a favor do
      código. Discrepâncias anotadas para o dono decidir (o glossário segue o código; os
      documentos que divergem **não** foram tocados): (1) a prosa dos ADRs diz "conta" onde o
      código diz `User`; (2) os ADRs de view dizem *capability* onde o código diz feature
      efetiva (`computeEffectiveFeatures`, `features` do `/me`); (3) o ADR `0087` lista `me`
      como degrau das views de user, mas no contrato `me` é recurso próprio (`meViews`);
      (4) `apps/api/docs/reference/schema.md` § "Constantes de domínio" lista as roles sem
      `stockist` e `catalog-manager`; (5) dois comentários se dizem "a única tabela de domínio
      sem `deletedAt`" (`Tag`, 9.6/W5, e `ProductImage`, 9.10/AA16); (6) os comentários de
      `prisma/schema.prisma` citam o ADR de pets e a política de log pelos caminhos antigos
      (sem número, e `logging-policy` fora de `reference/`), que não existem mais — o
      `docs:check` não varre `.prisma`.
- [x] Nenhuma frase do glossário explica *por que* — se a definição precisa de racional, ela
      aponta para o ADR.
- [x] `apps/api/docs/adr/README.md` (índice), `apps/api/CLAUDE.md`, `docs/agents/domain.md` e o
      `CONTEXT-MAP.md` da raiz passam a apontar para o glossário como fonte do vocabulário (hoje
      dizem "nasce na issue 08") e para os ADRs como fonte do porquê. O `CLAUDE.md` da raiz e o
      `apps/api/docs/README.md` diziam o mesmo e foram corrigidos junto.
- [x] O `CONTEXT-MAP.md` da raiz passa a **linkar** o arquivo (hoje o nomeia como texto, para o
      `docs:check` não cobrar antes da hora); `docs:check` verde.
