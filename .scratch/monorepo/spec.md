# Fase 11 — Monorepo: pnpm workspaces, Turborepo e o primeiro contrato compartilhado

Status: ready-for-agent

> Nenhum domínio novo. A fase transforma **este repositório, in-place**, no monorepo
> `pet-oasis`: a API desce para `apps/api`, o `pet-oasis-web` é importado com histórico, e o
> primeiro pacote compartilhado — os **contratos Zod da API** — nasce. Junto, o modo de
> trabalho é unificado: um só fluxo de branches, Conventional Commits com lint, CI de
> verificação, e a documentação de domínio alinhada ao pacote de skills
> (`grill-with-docs → to-spec → to-tickets → implement`). Carrinho, pedido e pagamento,
> antes "Fase 11", passam a ser fase posterior; a espinha de autenticação do web vira a Fase 12.
>
> Decisões fechadas em três rodadas de grelha (6 + 8 + 6 perguntas). O projeto é de estudo e
> portfólio: **aprender monorepo é entrega**, não efeito colateral — por isso a migração é
> por camadas, uma tecnologia por issue, cada uma com critério de aceite próprio.

---

## Problem Statement

O Pet Oasis é hoje dois repositórios que compartilham **zero código** e um acoplamento
implícito. A API define os schemas Zod de request e resposta; o front, num repo irmão, vai ter
de reescrevê-los à mão — e cada mudança de contrato na API vira um bug silencioso no web, que
só aparece em runtime, sem type-check nenhum atravessando a fronteira. O mesmo problema se
repete para cada cliente futuro (app mobile em Expo, back-office interno em Angular): três
cópias do mesmo contrato envelhecendo em ritmos diferentes.

O acoplamento implícito também vaza para a infra: o Compose de produção do web depende de uma
rede Docker que "torce" para o Compose da API ter criado, e o `CLAUDE.md` do web aponta para
guias da API por caminho relativo de sistema de arquivos (`../pet-oasis-api/...`) que só
existe na máquina de quem clonou os dois lado a lado.

E o modo de trabalho diverge: a API tem `dev`/`main`/fases e commits em inglês sem convenção;
o web tem só `main` + feature branches, sem fases. As versões de TypeScript, Biome e
`@types/node` já divergem entre os dois. A documentação de domínio segue duas convenções — a
API guarda o *porquê* em `docs/context/` e proíbe `CONTEXT.md` na raiz; o web tem `CONTEXT.md`
como a skill original pede. Com três ou quatro apps isso não escala.

## Solution

Um único repositório `pet-oasis`, gerido por **pnpm workspaces** e orquestrado por
**Turborepo**, onde:

- `apps/api` é a API de hoje, com histórico preservado (o repo é o mesmo, renomeado).
- `apps/web` é o front, importado **com histórico** já reescrito para o caminho novo.
- `packages/api-contracts` é o que atravessa a rede entre eles: schemas de request, views de
  resposta, enums de domínio, nomes de role/feature e o shape de erro — dependendo **só de
  `zod`**. O web (e amanhã o mobile) importa o contrato; a API o consome nos próprios
  controllers e presenters, então a fonte é uma.
- `packages/tsconfig` e `packages/biome-config` fixam o tooling; o `catalog:` do pnpm fixa uma
  versão por dependência compartilhada.
- Um Dockerfile por app, um stack Compose na raiz: `prod:up` sobe o sistema inteiro,
  `prod:up api` reconstrói e reinicia só a API. Monorepo não é monólito — cada app tem seu
  tempo de deploy.
- Um fluxo: `main` (produção, intocável) ← `dev` ← `fase-<n>` ← `feat/fase-<n>-<NN>-<slug>`,
  para tudo. Conventional Commits em inglês com escopo obrigatório (`api`, `web`,
  `contracts`, `tsconfig`, `biome-config`, `infra`, `ci`, `repo`), lintados no hook e no CI.
- CI de verificação (typecheck, lint, test, commitlint) rodando só o afetado. Sem deploy
  automático — esforço próprio, depois.
- Documentação de domínio fiel à skill: `CONTEXT-MAP.md` na raiz apontando o `CONTEXT.md` de
  cada app; ADRs numerados; `.scratch/`, `docs/todo.md` e o `CLAUDE.md` geral na raiz, com um
  `CLAUDE.md` por app só para o que é específico da stack.

## User Stories

1. Como desenvolvedor do web, quero importar o schema de request de um endpoint da API a partir de um pacote compartilhado, para que um formulário valide exatamente o que a API valida, sem cópia.
2. Como desenvolvedor do web, quero importar a view de resposta de um endpoint, para que o tipo do que renderizo seja o tipo do que a API devolve.
3. Como desenvolvedor do web, quero os nomes de role e feature como constantes tipadas do contrato, para esconder um botão por capability sem digitar a string.
4. Como desenvolvedor do web, quero o shape de erro da API (422 por campo, `code` do 401/403) como tipo do contrato, para tratar erro sem adivinhar o formato.
5. Como desenvolvedor da API, quero que uma mudança de contrato quebre o `typecheck` do web no mesmo PR, para descobrir a quebra antes do deploy e não depois.
6. Como desenvolvedor da API, quero que o contrato não consiga depender de nada além de `zod`, para que o web nunca receba o Prisma ou um helper de servidor por arrasto.
7. Como desenvolvedor da API, quero um teste que prove que cada enum do contrato bate com o enum do Prisma, para que dois donos do mesmo valor não divirjam em silêncio.
8. Como desenvolvedor de um cliente futuro (mobile, back-office), quero um só pacote de contratos para consumir, para não reescrever o mesmo schema pela terceira vez.
9. Como mantenedor, quero um único lockfile e um único gestor de pacotes, para que "funciona no web, quebra no contrato" não exista por diferença de versão.
10. Como mantenedor, quero uma versão só de TypeScript, Biome, `@types/node` e Zod em todo o workspace, fixada num lugar só.
11. Como mantenedor, quero que a instalação seja estrita — nenhum pacote importa dependência que não declarou —, para que a fronteira entre pacotes seja real e não só convenção.
12. Como mantenedor, quero que `typecheck`, `lint` e `build` sejam cacheados e rodem só para o que mudou, para que a verificação do repo inteiro custe o preço de um app.
13. Como mantenedor, quero um `dev` na raiz que suba API e web juntos, para trabalhar numa feature que toca os dois.
14. Como mantenedor, quero subir só um app em dev, para não pagar o custo do outro quando não preciso dele.
15. Como operador do VPS, quero fazer deploy só da API — deixando o web rodando a imagem anterior — porque a API anda à frente do front.
16. Como operador do VPS, quero subir o sistema inteiro com um comando quando os dois mudaram.
17. Como operador do VPS, quero que a rede entre API e web pertença ao stack, para que o `up` do web não falhe por a rede da API "não existir".
18. Como operador do VPS, quero que a imagem de cada app contenha só as dependências de produção daquele app, e não o workspace inteiro.
19. Como mantenedor, quero que o `git blame` continue apontando o commit real de cada linha depois do move para `apps/api`, para que a arqueologia do código não morra na migração.
20. Como mantenedor, quero que o histórico do web apareça no monorepo já com os caminhos de `apps/web`, para que `git log --follow` atravesse a importação.
21. Como mantenedor, quero que todo commit tenha tipo e escopo válidos, verificados antes de entrar, para que o log diga o que mudou e onde.
22. Como mantenedor, quero que o CI recuse um PR com commit fora da convenção, para que o hook local não seja a única barreira.
23. Como mantenedor, quero que o CI rode typecheck, lint e testes de tudo que um PR afetou — e só disso —, para que `main` e `dev` fiquem sempre verdes sem esperar a suíte inteira a cada docs.
24. Como mantenedor, quero um só `.scratch/`, um só `docs/todo.md` e uma só numeração de fase, para que uma fase que toca API, contrato e web tenha um número só.
25. Como mantenedor, quero um `CLAUDE.md` na raiz com o fluxo e as regras transversais, e um por app só com o específico da stack, para que o agente não leia regra de Prisma trabalhando no Next.
26. Como mantenedor, quero um `CONTEXT-MAP.md` na raiz e um `CONTEXT.md` por app, para que o vocabulário de cada contexto seja um glossário curto e não uma pilha de racional.
27. Como mantenedor, quero um glossário da API separado do `docs/context/`, para que "o que a palavra significa" e "por que decidimos assim" não morem no mesmo arquivo gigante.
28. Como mantenedor, quero ADRs numerados numa convenção só, na raiz para decisões de sistema e por app para as locais.
29. Como mantenedor, quero que o `docs:check` cubra o repo inteiro, para que um caminho quebrado no web ou num ADR da raiz fique vermelho igual ao da API.
30. Como mantenedor, quero que os caminhos `../pet-oasis-api/...` do web deixem de existir, para que a documentação do web não dependa de onde o repo irmão foi clonado.
31. Como mantenedor, quero que a versão do Node e do pnpm estejam pinadas no repo, para que a máquina, o CI e a imagem Docker instalem a mesma coisa.
32. Como mantenedor, quero que o `.scratch` aberto do web migre para a raiz com um número de fase, para que o trabalho dele continue de onde parou, dentro do fluxo único.
33. Como mantenedor, quero que o repo no GitHub se chame `pet-oasis` quando `main` passar a ser o monorepo, sem quebrar o clone do VPS.
34. Como leitor do portfólio, quero ver o histórico de fases contínuo e um ADR explicando por que o monorepo existe, para entender a decisão sem ler a conversa.
35. Como aprendiz, quero cada tecnologia (pnpm, workspaces, pacotes internos, Turbo, commitlint, CI) entrar numa issue própria com critério de aceite próprio, para saber o que cada camada faz e o que quebra quando ela falta.

## Implementation Decisions

### Estratégia: in-place, uma camada por issue

- **O repositório é o mesmo.** `pet-oasis-api` vira `pet-oasis`; a API desce para `apps/api`
  num commit de move, o web é importado depois. Histórico, branches, remotes e o fluxo de fases
  sobrevivem. O commit do move entra num `.git-blame-ignore-revs` na raiz, para o `blame` (e o
  GitHub) pularem o move e mostrarem o autor real.
- **Ordem das camadas:** pnpm no pacote único → layout `apps/api` como workspace-de-um →
  configs compartilhadas → Turborepo → commitlint → CI → esqueleto de docs da raiz → glossário
  da API → `api-contracts` → import do web → web consome o contrato → fecho. A razão de pnpm vir
  **antes** do layout é a estritez: dependência fantasma aparece com a suíte verde como oráculo
  e sem confundir "quebrou pelo pnpm" com "quebrou pelo move". Contratos vêm antes do web porque
  a extração é refactor interno da API, guiado pela suíte dela; CI vem antes do import para o
  import já nascer verificado.
- **O web congela** no repo dele num ponto verde (tudo commitado) até ser importado. Não há
  trabalho paralelo no web durante a fase.

### Layout e pacotes

- `apps/api`, `apps/web`, `packages/api-contracts`, `packages/tsconfig`, `packages/biome-config`.
  Escopo `@pet-oasis/*`, nunca publicado — o escopo só evita colisão com pacotes reais.
  Dependências internas por `workspace:*`.
- Um único pacote de contratos. Quebrar por domínio (`contracts-auth`, `contracts-catalog`) é
  otimização prematura. `tsconfig` e `biome-config` separados porque Expo/Angular vão puxar
  presets diferentes.
- `packages/tsconfig` oferece presets por alvo (Node, Next, biblioteca). `packages/biome-config`
  é a base; cada app estende e acrescenta só o que é seu (ignores do Prisma gerado, etc.).

### O que é contrato — fronteira do `api-contracts`

- **Migra:** (1) schemas de request — create, update, query, path; (2) views de resposta — só
  os schemas Zod; o helper que faz o `.parse()` por whitelist **fica na API**; (3) enums de
  domínio como `z.enum` **definidos no contrato**; (4) constantes de nomes de role e feature,
  inclusive o conjunto de features privilegiadas; (5) o shape de erro — `errors` por campo do
  422, `code` do 401/403/409, envelope comum.
- **Não migra:** factories de erro, o helper de paginação do repository, slugify, geração de
  token, qualquer coisa que toque Prisma, Express ou banco.
- **O pacote só depende de `zod`.** Qualquer outro import é sinal de que a coisa não é
  contrato. A regra vira texto no `CLAUDE.md` e teste no pacote (ver Testing).
- **Enums têm dois donos, com prova.** O Prisma continua dono do banco; o contrato é dono do
  que atravessa a rede. Um teste na API compara os valores de cada `z.enum` exportado com o enum
  gerado pelo Prisma correspondente. Divergência é teste vermelho, não bug em produção.
- A API passa a **importar** os schemas do contrato nos controllers e presenters — a fonte é
  uma. Os schemas que hoje importam enum do Prisma passam a importar o enum do contrato.
- **Compatibilidade de `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`:** o contrato
  compila sob o preset mais estrito do workspace, para que nenhum consumidor seja menos estrito
  que a fonte.

### Gestor de pacotes e versões

- pnpm, pinado via campo `packageManager` + corepack; `engines.node` declarado; `.npmrc`
  único na raiz. O `allowScripts` do npm vira a lista de `onlyBuiltDependencies` do pnpm
  (bcrypt, prisma, engines, esbuild, sharp).
- `catalog:` no `pnpm-workspace.yaml` para tudo que aparece em mais de um pacote (TypeScript,
  Biome, `@types/node`, Zod, Vitest onde houver). **Uma versão.** A API sobe para a versão
  mais nova onde não houver breaking change grande; TS 6 × Next 16 é **fato a verificar** na
  issue do import — se o Next não aceitar TS 6, a API desce.

### Turborepo e scripts

- `turbo.json` com `typecheck`, `lint`, `build` cacheados; `test` **sem cache** nesta fase
  (sobe Postgres via Compose e lê `.env.test`; cachear exigiria declarar esses inputs, e o
  risco é falso-verde). `dev` é persistente. `build` do contrato precede `typecheck` de quem
  o consome (`dependsOn: ["^build"]`) — ou o contrato é consumido direto do fonte via
  `exports` apontando para TS, decisão de implementação da issue do contrato.
- Scripts da raiz delegam ao Turbo; `dev` na raiz sobe tudo, `pnpm dev --filter=<app>` sobe
  um. Os scripts de `db:*`, `prod:*`, `dev:*` da API continuam no `package.json` dela, pois
  são dela. `docs:check` vira task da raiz e cobre o repo inteiro.

### Docker e Compose

- **Dockerfile por app**, com o contexto de build na **raiz do monorepo** (o lockfile e o
  workspace vivem lá). A imagem de produção contém só as dependências daquele app, podadas
  por `pnpm deploy --filter <app> --prod`. As três stages da API (build, runtime, dev) e o
  OpenSSL antes do install sobrevivem.
- **Compose unificado** em `infra/` da raiz: base + overrides por ambiente, projeto
  `pet-oasis-{dev,test,prod}`, serviços `api`, `web`, `db`, `redis`, `mailpit` conforme o
  ambiente. Subir tudo ou um serviço é escolha de argumento, não de arquivo. A rede que hoje
  o web declara como externa passa a pertencer ao stack; a rede `proxy` do nginx continua
  externa.
- O VPS clona o monorepo inteiro. O guia de deploy é reescrito no fecho, junto com o rename.

### Fluxo de trabalho e commits

- Um fluxo para tudo: `main` ← `dev` ← `fase-<n>` ← `feat/fase-<n>-<NN>-<slug>`. O web perde
  a exceção "não existe `dev`". Numeração de fase global ao sistema: a espinha de
  autenticação do web é a Fase 12.
- **Conventional Commits em inglês**, husky + commitlint com `config-conventional`, escopo
  **obrigatório** e restrito ao enum `api`, `web`, `contracts`, `tsconfig`, `biome-config`,
  `infra`, `ci`, `repo`. Multi-escopo com vírgula. Apps futuros entram no enum quando existirem.
- Mensagem de merge passa a ser a padrão do Git (`Merge branch '...' into ...`), que o
  commitlint ignora; `--no-ff` continua. O estilo `merge: ...` de hoje é abandonado.
- A regra "nenhum commit leva trailer de agente" continua e sobe para o `CLAUDE.md` da raiz.

### CI

- GitHub Actions, verificação apenas: `typecheck`, `lint`, `test` filtrados pelo afetado em
  relação à base do PR, com Postgres e Redis como services; commitlint sobre os commits do PR.
  **Sem deploy automático** e **sem remote cache** nesta fase — cada um é esforço próprio.

### Documentação e modo de trabalho

- **Raiz:** `CLAUDE.md` geral (fluxo, branches, commits, regras transversais, mapa do
  monorepo), `CONTEXT-MAP.md`, `docs/` geral (ADRs de sistema numerados, `todo.md`, guias que
  valem para o todo), `.scratch/` único.
- **Por app:** `CLAUDE.md` só com o específico da stack; `CONTEXT.md` (glossário puro, sem
  racional); `docs/` com ADRs locais numerados e, na API, o `docs/context/` de hoje como
  *porquê* indexado — que continua existindo, mas deixa de ser glossário.
- O glossário da API é **escrito do zero** como issue própria, destilado do `docs/context/`.
- ADRs da API são renomeados para `NNNN-slug.md`; o `docs:check` denuncia todo link quebrado.
- O `.scratch` aberto do web migra para a raiz com número de fase; a spec e as issues dele
  são mantidas como estão, só o ponteiro muda.
- Pipeline de trabalho de qualquer fase daqui em diante: `grill-with-docs → to-spec →
  to-tickets → implement`, com `.scratch/` da raiz como tracker. O que a API já adaptava das
  skills (tracker em markdown, labels de triagem, domain docs) é mantido, adaptado só ao que
  o monorepo exige.

### Fecho

- ADR de sistema na raiz: por que monorepo, por que pnpm + Turbo, por que in-place, o que é
  contrato.
- Rename do repo no GitHub (`pet-oasis-api` → `pet-oasis`) como **último ato do merge em
  `main`** — o GitHub redireciona o nome antigo; o remote do VPS é atualizado no mesmo passo.
- `todo.md` destilado; decisões promovidas a `docs/context/` / ADR antes de fechar.

## Testing Decisions

- **Um bom teste aqui prova comportamento externo, não estrutura.** A migração inteira é
  refactor sem mudança de comportamento, e a definição operacional de "sem mudança" é: a
  suíte de integração HTTP da API (Vitest+Supertest, 1193 casos), `typecheck`, `lint` e
  `docs:check` **verdes antes e depois de cada issue**. Nenhuma issue mergeia vermelha.
- **Costuras existentes (preferidas):** a suíte HTTP da API é o oráculo de pnpm, move, configs
  compartilhadas, Turbo e da extração dos contratos. A verificação de Docker é **manual**
  (build das stages + bring-up do stack), como na Fase 10 — não há teste que viva no Docker.
- **Costura nova 1 — paridade de enums** (na API, porque precisa do Prisma): para cada enum
  exportado pelo contrato, `z.enum(...).options` é igual ao conjunto de valores do enum gerado
  pelo Prisma. Prior art: os testes-guarda de convenção da API (`clearDatabase.guard`,
  `mass-assignment`).
- **Costura nova 2 — pureza do contrato** (no próprio pacote): as dependências declaradas são
  exatamente `zod`, e nenhum arquivo do pacote importa de fora dele (sem alias `@/`, sem
  `apps/`, sem `@prisma`). É o `.strict()` da regra "só depende de zod". Prior art:
  `mass-assignment.test.ts`, que existe para que um `.strict()` perdido fique vermelho.
- **Verificação que é a própria entrega:** o workflow de CI rodando as costuras acima +
  commitlint; o `typecheck` do web importando um schema do contrato.
- **Não se testa:** o cache do Turbo, o hook do husky, o `filter-repo` — verificados por uso
  na issue, não por teste que fica. Os testes de schema existentes continuam na API, onde
  estão.

## Out of Scope

- Deploy automático (SSH no VPS no merge em `main`) — esforço próprio, com o skill `wizard`.
- Remote cache do Turborepo.
- Cachear `test` no Turbo.
- Apps novos (Expo, Angular) e seus presets — entram quando existirem, inclusive no enum de
  escopos do commitlint.
- Qualquer tela ou funcionalidade do web além do smoke "importa um schema e o `typecheck`
  passa" — a espinha de autenticação é a Fase 12.
- Quebrar o contrato por domínio; versionar o contrato; publicar em registry.
- Carrinho, pedido, pagamento.
- Migrar o `docs/context/` da API para outro formato — continua como está, só deixa de ser
  chamado de glossário.

## Further Notes

- **9 de 29 arquivos de schema/presenter da API importam enums gerados pelo Prisma** — é o
  acoplamento que a decisão "enum com dois donos e teste de paridade" desfaz. Outros importam
  o helper de presenter, paginação, token, slugify e factories de erro: cada um precisa de
  uma decisão local (migra o schema, fica o helper) na issue do contrato.
- O web tem `TS 5.9`, `Biome 2.5`, `@types/node 24`; a API tem `TS 6.0`, `Biome 2.4`,
  `@types/node 25`. O `catalog:` resolve, mas a compatibilidade Next 16 × TS 6 é o único
  ponto onde "subir tudo" pode não ser possível.
- O `.dockerignore` de cada app hoje exclui `docs/` e `**/*.md`; com o contexto na raiz, cada
  Dockerfile precisa de ignore que exclua o **outro** app e os `node_modules` de todos.
- Serviços systemd do VPS (cron de limpeza) chamam o container pelo nome `pet-oasis-api`;
  o nome do container não muda, então eles sobrevivem — conferir no fecho.
