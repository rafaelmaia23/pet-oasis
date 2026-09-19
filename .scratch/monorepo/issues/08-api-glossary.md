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
      código. Discrepâncias que o glossário expôs e o fecho corrigiu na fonte: o ADR `0087`
      listava `me` como degrau das views de user (é recurso próprio, `meViews`);
      `apps/api/docs/reference/schema.md` listava as roles sem `stockist` e `catalog-manager`; `Tag` e
      `ProductImage` se diziam, cada uma, "a única tabela de domínio sem `deletedAt`" (ADRs
      `0007`/`0046`, `schema.md`, `schema.prisma` e dois repositórios); e os comentários de
      `prisma/schema.prisma` citavam ADRs pelos caminhos antigos — o `docs:check` passou a
      varrer `.prisma`. Ficaram em aberto, para o dono, dois sinônimos de prosa espalhados
      por dezenas de arquivos: "conta" onde o código diz `User` (44 ADRs) e *capability* onde
      o código diz feature efetiva (25 arquivos, inclusive os títulos dos ADRs `0086`/`0087`).
- [x] Nenhuma frase do glossário explica *por que* — se a definição precisa de racional, ela
      aponta para o ADR.
- [x] `apps/api/docs/adr/README.md` (índice), `apps/api/CLAUDE.md`, `docs/agents/domain.md` e o
      `CONTEXT-MAP.md` da raiz passam a apontar para o glossário como fonte do vocabulário (hoje
      dizem "nasce na issue 08") e para os ADRs como fonte do porquê. O `CLAUDE.md` da raiz e o
      `apps/api/docs/README.md` diziam o mesmo e foram corrigidos junto.
- [x] O `CONTEXT-MAP.md` da raiz passa a **linkar** o arquivo (hoje o nomeia como texto, para o
      `docs:check` não cobrar antes da hora); `docs:check` verde.
