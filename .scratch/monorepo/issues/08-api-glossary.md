# 08: Glossário da API (`CONTEXT.md`)

**What to build:** `apps/api/CONTEXT.md` existe como **glossário puro** do contexto da API —
cada termo do domínio (User, Customer, Employee, Role, Feature, override, perfil, sessão,
Product, ProductVariant, Category, Tag, Brand, Pet, PetSpecies, soft delete, reativação,
banimento, lockout…) com a definição de uma ou duas linhas e os termos a evitar —, no formato
da skill, sem racional, sem implementação. O *porquê* continua nos ADRs da API (um por decisão,
índice em `apps/api/docs/adr/README.md` — o `docs/context/` foi migrado inteiro na 07).

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] O arquivo segue o formato de `CONTEXT-FORMAT.md` da skill `domain-modeling` (seções
      `Language`, termos em negrito, `_Avoid_`), como o do web já faz.
- [ ] Todo termo é **destilado** dos ADRs existentes (`apps/api/docs/adr/`) — nenhum termo novo
      é inventado; termo que o código chama de um nome e a doc de outro é resolvido a favor do
      código, e a discrepância é anotada para o usuário decidir.
- [ ] Nenhuma frase do glossário explica *por que* — se a definição precisa de racional, ela
      aponta para o ADR.
- [ ] `apps/api/docs/adr/README.md` (índice), `apps/api/CLAUDE.md`, `docs/agents/domain.md` e o
      `CONTEXT-MAP.md` da raiz passam a apontar para o glossário como fonte do vocabulário (hoje
      dizem "nasce na issue 08") e para os ADRs como fonte do porquê.
- [ ] O `CONTEXT-MAP.md` da raiz passa a **linkar** o arquivo (hoje o nomeia como texto, para o
      `docs:check` não cobrar antes da hora); `docs:check` verde.
