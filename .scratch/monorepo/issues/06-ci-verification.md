# 06: CI de verificação

**What to build:** todo push em branch e todo PR para `dev` ou `main` roda no GitHub Actions
`typecheck`, `lint` e `test` **do que foi afetado**, com Postgres e Redis de teste como
services, e o commitlint sobre os commits do PR. `main` e `dev` passam a ter um "verde"
verificável fora da máquina de quem mergeia. **Sem** deploy automático e **sem** remote cache.

**Blocked by:** 04, 05.

**Status:** ready-for-agent

- [ ] Workflow em `.github/workflows/` disparado por `pull_request` e por `push` em `dev`/`main`;
      Node e pnpm vêm de `packageManager` (corepack), com cache do store do pnpm.
- [ ] `turbo run typecheck lint test --filter=...[<base>]` roda só o afetado em relação à base
      do PR (ou ao commit anterior no push); um PR só de docs não roda a suíte da API.
- [ ] Postgres (com as extensões que a busca textual exige) e Redis sobem como `services` do
      job, na porta e com as credenciais que o `.env.test` espera; o `.env.test` do CI é gerado
      a partir do `.env.example` ou de secrets — nunca commitado.
- [ ] O `test` da API no CI **não** tenta subir o Compose (os services já estão de pé): o script
      de teste ganha o modo que pula o `test:services:*` quando o banco já responde, ou o CI
      chama o `vitest` direto — decisão registrada no workflow.
- [ ] Job separado de commitlint valida todos os commits do PR (`--from <base> --to <head>`).
- [ ] O status do CI aparece no PR; um PR com commit inválido ou suíte vermelha fica vermelho
      (provado com um PR de teste, depois fechado).
- [ ] README da raiz ganha o badge/descrição do CI; o `CLAUDE.md` passa a exigir CI verde antes
      de mergear fase na `dev` e `dev` na `main`.
