# 01: pnpm no pacote único

**What to build:** a API, ainda como pacote único na raiz do repo, instala, testa, faz
typecheck, lint, build e constrói as três stages do Dockerfile **com pnpm** — e o npm deixa de
existir no projeto. É a primeira camada da migração, isolada de propósito: a estritez do pnpm
(nenhum import de dependência não declarada) aparece aqui, com a suíte inteira verde como
oráculo, e não misturada ao move de diretório da issue seguinte.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] `pnpm` é pinado pelo campo `packageManager` do `package.json` (corepack) e a versão do
      Node por `engines`; o `.npmrc` existente ganha o que o pnpm precisa e perde o que era só
      do npm.
- [ ] O `package-lock.json` some; o `pnpm-lock.yaml` é versionado; `pnpm install --frozen-lockfile`
      reproduz o ambiente.
- [ ] O `allowScripts` do npm vira a lista equivalente de build scripts permitidos do pnpm
      (bcrypt, prisma, engines do prisma, esbuild, sharp) — provado por um install limpo sem
      warning de script bloqueado e pelo `bcrypt`/`sharp` funcionando na suíte.
- [ ] Toda dependência fantasma que a estritez expuser é **declarada** no `package.json`, nunca
      contornada por hoisting (`shamefully-hoist` e `public-hoist-pattern` ficam fora).
- [ ] Os scripts do `package.json` que chamam `npm run` passam a chamar `pnpm`; os que usam
      `npx` passam a usar `pnpm exec`/`pnpm dlx` conforme o caso.
- [ ] As três stages do Dockerfile (`build`, `runtime`, `dev`) instalam com pnpm via corepack;
      o `runtime` continua só com dependências de produção (o equivalente do `npm prune
      --omit=dev`) e continua rodando como `USER node`; o OpenSSL-antes-do-install é preservado.
- [ ] O entrypoint de dev (que roda `prisma generate` e `migrate deploy`) funciona com pnpm.
- [ ] Suíte completa + `typecheck` + `lint` + `docs:check` verdes; `docker build` dos três
      targets verde; `dev` sobe e responde; `prod:up` sobe e responde (verificação manual).
- [ ] README, guia de deploy e o `CLAUDE.md` deixam de dizer `npm`; a regra "prefira os scripts
      do `package.json`" passa a citar `pnpm run`.
