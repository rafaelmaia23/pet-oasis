# 13: Fecho da fase — ADR, destilação, deploy e rename

**What to build:** a fase fecha com dono permanente para cada decisão, o guia de deploy
reescrito para o monorepo, `main` virando o monorepo, e o repo renomeado no GitHub para
`pet-oasis` — o último ato, porque é o momento em que `main` deixa de ser só a API.

**Blocked by:** 08, 12, 15.

**Status:** ready-for-agent

- [ ] ADR de sistema na raiz (numerado): por que monorepo, por que in-place, por que pnpm +
      Turbo, o que é contrato e a regra dos dois donos, o que ficou de fora (deploy automático,
      remote cache, cache de `test`) e quando revisitar.
- [ ] Índice dos ADRs de sistema criado: um `README.md` em `docs/adr/` da raiz, por tema, no molde
      do `apps/api/docs/adr/README.md` (uma linha por decisão): com o ADR acima serão três
      (`0001` docs seguem a skill, `0002` pasta do tracker = fase), e a linha de `adr/` na
      tabela de `docs/README.md`, que hoje os lista entre parênteses, passa a apontar só para o
      índice. Pedido pela revisão da issue 15; o protocolo "leia o índice, abra um arquivo" do
      `CLAUDE.md` vale também para a raiz.
- [ ] Tabela de rastreio decisão → destino feita e conferida: toda decisão da spec tem dono em
      ADR (da raiz, para o que é de sistema; da API, `apps/api/docs/adr/`, para o que é dela —
      o `docs/context/` não existe mais desde a 07); a primeira linha da spec vira
      `Status: fechada em <data> — porquê promovido a <caminhos>`.
- [ ] Racionais que nasceram na execução (não estão na spec) e hoje vivem só em comentário de
      código, a promover para ADRs da API (temas *Infraestrutura* ou *Arquitetura* do índice):
      da issue 01 — Node e pnpm com fonte única (`engines` + `packageManager`, corepack; o
      Dockerfile não escreve versão nenhuma, e o pnpm recusa Node fora de `engines`); `.npmrc`
      não existe porque pnpm 12 lê `pnpm-workspace.yaml`; `allowBuilds` (por que `vue-demi`
      entra e `sharp` não); e o gotcha do bundle do Scalar (caminho real em
      `node_modules/.pnpm/…` × `sendFile` recusando segmento com ponto → `root` + arquivo
      relativo, em `src/docs/reference.ts`). Da issue 11 — o `catalog:` do pnpm e as duas
      exceções à regra "mais nova" (TS 6, não 7; `@types/node` casando com `engines.node`,
      em `pnpm-workspace.yaml`); o stack Compose único e o que ele fixou (o `web` só no
      override de produção porque em dev roda no host; sem `depends_on: api`; `prod:*` na
      raiz, `dev*`/`test:services:*` na API; env por app, o da API como `--env-file` de
      interpolação — comentários em `infra/docker-compose*.yml`); e as imagens construídas
      da raiz com install filtrado e o outro app fora (`pnpm deploy` antes do `next build`
      no web; `Dockerfile.dockerignore` por app — comentários nos dois Dockerfiles). O tema
      é *Infraestrutura* na API para o que é dela; o que é do sistema vai no ADR da raiz.
- [ ] `docs/todo.md` da raiz: Fase 11 destilada na forma fechada; a fase de carrinho/pedido/
      pagamento reaparece como "a fazer" com número novo, sem perder o que a Fase 9 já decidiu
      para ela (`OrderItem` polimórfico, preço gravado, `StockMovement`).
- [ ] Guia de deploy reescrito: clone do monorepo, `prod:up` do stack, deploy de um serviço só,
      onde ficam os `.env.*`, o `chown` de uploads, os serviços systemd (que chamam o container
      pelo nome — conferido que o nome não mudou).
- [ ] Merge `fase-11` → `dev` (`--no-ff`), suíte completa verde na `dev` e no CI, merge `dev` →
      `main`, nova `dev` a partir da `main`.
- [ ] Repo renomeado no GitHub para `pet-oasis`; remote do VPS atualizado; um deploy real do
      stack feito a partir do monorepo, com API e web respondendo.
- [ ] `README.md` da raiz apresenta o monorepo (o que é cada app/pacote, comandos, CI); o da
      API e o do web apontam para ele para o que é geral.
