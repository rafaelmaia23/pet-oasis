# 10: `api-contracts` — migração dos schemas e views

**What to build:** todo schema de request (create, update, query, path) e toda view de
resposta da API vivem no contrato, e a API os **importa de lá** — controllers, presenters e
testes. Os arquivos de schema antigos são apagados ("contract" do refactor largo). O helper que
faz `.parse()` por whitelist fica na API; só os schemas Zod migram. A suíte da API é o oráculo:
nenhum comportamento muda.

**Blocked by:** 09.

**Status:** ready-for-agent

- [ ] Migração **módulo a módulo** (auth, user e perfis, role, feature, permission, pet, brand,
      category, tag, product/variant/image, audit log, log, busca), cada módulo num commit,
      suíte verde entre um e outro.
- [ ] Um schema que importa algo que não é contrato é resolvido no lugar: enum do Prisma →
      enum do contrato; helper de paginação → o **schema** de query de paginação migra, o helper
      de repository fica; slugify/token/erro → o schema migra sem o import, e o que dependia
      dele fica na API como composição por cima do schema do contrato.
- [ ] Os `.max()` de texto, os `.strict()` dos updates, os `z.never` com mensagem própria e as
      peças de identidade reutilizadas (`emailSchema`, `cpfSchema`, `phoneSchema`) chegam
      intactos ao contrato — a suíte de `mass-assignment` e os testes de schema continuam
      verdes sem alteração.
- [ ] Os presenters da API passam a aplicar o helper de whitelist sobre a view importada do
      contrato; a resolução de view por capability continua na API.
- [ ] Os `*.schema.ts` e os schemas de view dos `*.presenter.ts` da API deixam de existir (ou
      sobram só como composição local que precisa de banco); os `*.constants.ts` que viraram
      reexport na issue 09 são apagados e os imports apontam para o contrato.
- [ ] A geração do OpenAPI continua funcionando a partir dos schemas do contrato (os `.meta()`
      migram junto); o `openapi.json` gerado é **idêntico** ao anterior — comparado antes/depois.
- [ ] A guarda de pureza e o teste de paridade continuam verdes; nenhum `@prisma`/`@/` entrou
      no pacote.
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes; Docker `build` da API verde
      (o pacote entra no `pnpm deploy`); `dev` e `prod:up` sobem.
- [ ] Documentação da API (`api-contracts.md`, `architecture.md` em `docs/context/`,
      convenções de código do `CLAUDE.md`) diz onde o schema vive agora.
