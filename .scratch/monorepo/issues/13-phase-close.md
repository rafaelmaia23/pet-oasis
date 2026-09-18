# 13: Fecho da fase — ADR, destilação, deploy e rename

**What to build:** a fase fecha com dono permanente para cada decisão, o guia de deploy
reescrito para o monorepo, `main` virando o monorepo, e o repo renomeado no GitHub para
`pet-oasis` — o último ato, porque é o momento em que `main` deixa de ser só a API.

**Blocked by:** 08, 12.

**Status:** ready-for-agent

- [ ] ADR de sistema na raiz (numerado): por que monorepo, por que in-place, por que pnpm +
      Turbo, o que é contrato e a regra dos dois donos, o que ficou de fora (deploy automático,
      remote cache, cache de `test`) e quando revisitar.
- [ ] Tabela de rastreio decisão → destino feita e conferida: toda decisão da spec tem dono em
      `docs/context/` (da raiz ou da API) ou em ADR; a primeira linha da spec vira
      `Status: fechada em <data> — porquê promovido a <caminhos>`.
- [ ] Racionais que nasceram na execução (não estão na spec) e hoje vivem só em comentário de
      código, a promover para `docs/context/infrastructure.md` (ou `architecture.md`):
      da issue 01 — Node e pnpm com fonte única (`engines` + `packageManager`, corepack; o
      Dockerfile não escreve versão nenhuma, e o pnpm recusa Node fora de `engines`); `.npmrc`
      não existe porque pnpm 12 lê `pnpm-workspace.yaml`; `allowBuilds` (por que `vue-demi`
      entra e `sharp` não); e o gotcha do bundle do Scalar (caminho real em
      `node_modules/.pnpm/…` × `sendFile` recusando segmento com ponto → `root` + arquivo
      relativo, em `src/docs/reference.ts`).
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
