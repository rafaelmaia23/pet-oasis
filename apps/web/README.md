# pet-oasis — web

Frontend web do **Pet Oasis**, uma loja de pet shop. É o app `apps/web` do monorepo
[`pet-oasis`](../../README.md) e consome a API REST de [`apps/api`](../api/README.md), que é
a autoridade de todo o domínio: aqui não há banco, não há regra de negócio e não há validação
que decide.

Next 16 (App Router) · React 19 · TypeScript estrito · Tailwind 4 (CSS-first) · Biome ·
Node 24 · pnpm (o do workspace).

## Rodar em desenvolvimento

```bash
pnpm install          # na raiz do monorepo, uma vez
pnpm --filter web dev # ou `pnpm run dev` de dentro de apps/web
```

A aplicação sobe **no host, na porta 3001** — a 3000 é da API. Abra
<http://localhost:3001>. A amostra do design system fica em
<http://localhost:3001/design>.

O desenvolvimento roda contra a API dockerizada, que precisa estar de pé (`pnpm run dev` em
`apps/api`). `pnpm dev` na raiz sobe os dois de uma vez. Como é a API que monta os links dos
emails, o `APP_URL` do ambiente de desenvolvimento dela precisa apontar para
`http://localhost:3001`.

## Comandos

Todos rodam de dentro de `apps/web` (ou da raiz, com `pnpm --filter web <script>`).

| Comando | O que faz |
|---|---|
| `pnpm run dev` | Servidor de desenvolvimento na porta 3001 |
| `pnpm run build` | Build de produção (emite o bundle standalone) |
| `pnpm start` | Serve o build, na porta 3001 |
| `pnpm run typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit` |
| `pnpm run lint` | Biome — lint **e** formatação, numa ferramenta só |
| `pnpm run lint:fix` | Biome aplicando as correções |
| `pnpm run contrast` | Mede o contraste de cada par de cor e falha se algum cair abaixo de AA |

Os de produção são da **raiz** — o stack Compose é do sistema inteiro:

| Comando (na raiz) | O que faz |
|---|---|
| `pnpm prod:up` | Sobe o stack inteiro (API, web, Postgres, Redis) |
| `pnpm prod:up web` | Reconstrói e reinicia só o web; a API continua rodando |
| `pnpm prod:down` | Derruba o stack |
| `pnpm prod:logs` | Acompanha os logs |

Antes de commitar: `pnpm typecheck`, `pnpm lint` e `pnpm docs:check` limpos, na raiz.

## Produção

A imagem é multi-stage, com o contexto de build na **raiz do monorepo**: o web é materializado
com `pnpm deploy` num diretório próprio, fora do workspace, e é lá que o `next build` roda —
a imagem não contém a API por construção. O runtime serve o bundle **standalone** do Next por
`node server.js`, sem CLI do Next e sem `node_modules` inteiro, como usuário não-root.

O container entra em **duas redes** (ADR-0004): a `frontend` do próprio stack, por onde vão
as chamadas server-side para a API (`http://api:3000`), e a `proxy`, externa, por onde o
nginx da frente o alcança. Só a `proxy` é criada fora do repositório (`docker network create
proxy`, uma vez no host); a outra nasce e morre com o stack. Postgres e Redis ficam numa
terceira rede, interna, que o front não alcança.

**A porta não é publicada no host.** O container escuta na 3001 dentro da rede e é alcançado
por `pet-oasis-web:3001`; todo tráfego público entra pelo nginx. Publicar a porta abriria um
caminho que desvia do TLS e do rate limit da frente.

```bash
cp apps/web/.env.example apps/web/.env.production   # hoje vazio de variáveis; precisa existir
pnpm prod:up web
```

O procedimento completo está em [`docs/guides/deploy.md`](docs/guides/deploy.md); o que vale
para o stack inteiro (host, redes, proxy hosts), no [guia da raiz](../../docs/guides/deploy.md).

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — o que é específico do web; o geral está no
  [`CLAUDE.md` da raiz](../../CLAUDE.md)
- [`CONTEXT.md`](CONTEXT.md) — glossário do domínio (o mapa dos contextos é o
  [`CONTEXT-MAP.md`](../../CONTEXT-MAP.md) da raiz)
- [`docs/adr/`](docs/adr/README.md) — decisões estruturais
- [`docs/guides/deploy.md`](docs/guides/deploy.md) — deploy só do web; o do stack inteiro é o
  [da raiz](../../docs/guides/deploy.md)
- [`docs/design-system.md`](docs/design-system.md) — direção visual, tokens e contrastes medidos
- [`.scratch/fase-12-web-auth-spine/`](../../.scratch/fase-12-web-auth-spine/) — a spec
  e as issues da Fase 12 (espinha de autenticação), no tracker da raiz
- [`integrating-with-the-api.md`](../api/docs/guides/integrating-with-the-api.md) —
  o guia da API para quem a consome: endereço, envelope de erro, sessão e as rotas que são
  contrato. **Primeira parada** para qualquer dúvida sobre o comportamento dela
- [`api-contracts`](../../packages/api-contracts/README.md) — o pacote de schemas
  Zod compartilhado, de onde vêm os tipos com que o web fala com a API
