# 14: Estágio base comum no Dockerfile da API

**What to build:** o Dockerfile da API deixa de repetir, em `build` e em `dev`, o mesmo bloco
de preparação (OpenSSL, corepack, manifestos do workspace, install, cópia do fonte): esse bloco
vive **uma vez**, num estágio base que os dois estendem, e o que cada estágio faz a mais fica
visível por contraste. Junto, o caminho da API dentro da imagem de dev (hoje escrito no
Dockerfile e repetido nos bind mounts do Compose de dev) passa a ter uma fonte só — ou a
repetição fica justificada por escrito. Levantado na revisão de padrões da issue 02 (Duplicated
Code + Shotgun Surgery, ambos "judgement call"); nada disto muda comportamento.

**Blocked by:** 03 (é a 03 que estabiliza o install no Dockerfile — manifestos dos `packages/*`
no contexto e o `injectWorkspacePackages` do `deploy`; refatorar antes é refatorar o que vai
mudar).

**Status:** ready-for-agent

- [ ] Um estágio base concentra o que `build` e `dev` compartilham: OpenSSL antes do install
      (com o comentário do porquê, uma vez só), `corepack enable`, cópia dos manifestos do
      workspace e `pnpm install --frozen-lockfile`. `build` e `dev` partem dele e ficam só com o
      que é seu (`generate`+`bundle`+`deploy` de um lado; entrypoint de dev do outro). O
      `runtime` continua raso, sem workspace, e não herda do base.
- [ ] O caminho da API dentro da imagem de dev tem uma fonte só (um `ARG`/variável que o
      Dockerfile e o override de dev do Compose compartilham) **ou** a repetição é mantida de
      propósito com o motivo em comentário nos dois lugares. Qual dos dois é decisão a
      apresentar ao dono com a consequência de cada um.
- [ ] Melhorias gerais avaliadas, cada uma adotada ou recusada com o motivo registrado no
      próprio Dockerfile: cache mount do store do pnpm no install (rebuild sem rebaixar
      dependência não baixa nada), e a ordem das camadas (mudança só em fonte não invalida a
      camada do install — já é assim hoje; a refatoração não pode regredir isso).
- [ ] Nenhuma mudança de comportamento, provada como na issue 02: três targets buildam; o
      `runtime` continua com só as dependências de produção da API, raso em `/app`, como uid
      1000; `dev` e `prod:up` sobem e respondem 200; suíte + `typecheck` + `lint` + `docs:check`
      verdes.
- [ ] O contexto de infraestrutura (ou o ADR, conforme a issue 07 decidir onde decisões passam a
      morar) registra por que o base existe e por que o `runtime` fica fora dele.
