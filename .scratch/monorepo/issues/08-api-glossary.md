# 08: Glossário da API (`CONTEXT.md`)

**What to build:** `apps/api/CONTEXT.md` existe como **glossário puro** do contexto da API —
cada termo do domínio (User, Customer, Employee, Role, Feature, override, perfil, sessão,
Product, ProductVariant, Category, Tag, Brand, Pet, PetSpecies, soft delete, reativação,
banimento, lockout…) com a definição de uma ou duas linhas e os termos a evitar —, no formato
da skill, sem racional, sem implementação. O `docs/context/` continua sendo o *porquê*; deixa
de ser chamado de glossário.

**Blocked by:** 07.

**Status:** ready-for-agent

- [ ] O arquivo segue o formato de `CONTEXT-FORMAT.md` da skill `domain-modeling` (seções
      `Language`, termos em negrito, `_Avoid_`), como o do web já faz.
- [ ] Todo termo é **destilado** do `docs/context/` e dos ADRs existentes — nenhum termo novo
      é inventado; termo que o código chama de um nome e a doc de outro é resolvido a favor do
      código, e a discrepância é anotada para o usuário decidir.
- [ ] Nenhuma frase do glossário explica *por que* — se a definição precisa de racional, ela
      aponta para o arquivo temático de `docs/context/` ou o ADR.
- [ ] `apps/api/docs/adr/README.md` (índice) e `docs/agents/domain.md` da API passam a apontar para o
      glossário como fonte do vocabulário e para os arquivos temáticos como fonte do porquê.
- [ ] `CONTEXT-MAP.md` da raiz aponta para ele; `docs:check` verde.
