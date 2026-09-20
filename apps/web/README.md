# pet-oasis-web

Frontend web do **Pet Oasis**, uma loja de pet shop. Consome a API REST do repositório irmão
[`pet-oasis-api`](../pet-oasis-api), que é a autoridade de todo o domínio: aqui não há banco,
não há regra de negócio e não há validação que decide.

> **Congelado em 2026-09-19**, num ponto verde, à espera do import para o monorepo
> `pet-oasis` como `apps/web` (issue 11 da Fase 11 da API). A espinha de autenticação
> (`.scratch/foundation-and-auth-spine/`) é a Fase 12 e será implementada lá.

Next 16 (App Router) · React 19 · TypeScript estrito · Tailwind 4 (CSS-first) · Biome ·
Node 24.

## Rodar em desenvolvimento

```bash
npm install
npm run dev
```

A aplicação sobe **no host, na porta 3001** — a 3000 é da API. Abra
<http://localhost:3001>. A amostra do design system fica em
<http://localhost:3001/design>.

O desenvolvimento roda contra a API dockerizada do repositório irmão, que precisa estar de
pé (`npm run dev` lá). Como é a API que monta os links dos emails, o `APP_URL` do ambiente de
desenvolvimento dela precisa apontar para `http://localhost:3001`.

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento na porta 3001 |
| `npm run build` | Build de produção (emite o bundle standalone) |
| `npm start` | Serve o build, na porta 3001 |
| `npm run typecheck` | Gera os tipos de rota do Next e roda `tsc --noEmit` |
| `npm run lint` | Biome — lint **e** formatação, numa ferramenta só |
| `npm run lint:fix` | Biome aplicando as correções |
| `npm run contrast` | Mede o contraste de cada par de cor e falha se algum cair abaixo de AA |
| `npm run prod:up` | Sobe o container de produção |
| `npm run prod:down` | Derruba o container de produção |
| `npm run prod:logs` | Acompanha os logs do container de produção |

Antes de commitar: `npm run typecheck` e `npm run lint` limpos.

## Produção

A imagem é multi-stage e serve o bundle **standalone** do Next por `node server.js`, sem CLI
do Next e sem `node_modules` inteiro, como usuário não-root.

O container entra em **duas redes Docker externas** (ADR-0004): `pet-oasis`, por onde vão as
chamadas server-side para a API, e `proxy`, por onde o nginx da frente o alcança. Nenhuma das
duas é criada aqui, nem pela API: são criadas **uma vez no host** (`docker network create`),
fora de qualquer repositório, e o front sobe com a API fora e vice-versa — o que falha, nesse
caso, é a chamada, não o `up`. Postgres e Redis ficam numa terceira rede, interna, que o front
não alcança.

**A porta não é publicada no host.** O container escuta na 3001 dentro da rede e é alcançado
por `web:3001`; todo tráfego público entra pelo nginx. Publicar a porta abriria um caminho
que desvia do TLS e do rate limit da frente.

```bash
cp .env.example .env.production   # confira API_NETWORK e PROXY_NETWORK
npm run prod:up
```

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — guia de trabalho no repositório
- [`CONTEXT.md`](CONTEXT.md) — glossário do domínio
- [`docs/adr/`](docs/adr/) — decisões estruturais
- [`docs/design-system.md`](docs/design-system.md) — direção visual, tokens e contrastes medidos
- [`.scratch/`](.scratch/) — specs e tickets
- [`integrating-with-the-api.md`](../pet-oasis-api/apps/api/docs/guides/integrating-with-the-api.md) —
  o guia da API para quem a consome: endereço, envelope de erro, sessão e as rotas que são
  contrato. **Primeira parada** para qualquer dúvida sobre o comportamento dela
- [`api-contracts`](../pet-oasis-api/packages/api-contracts/README.md) — o pacote de schemas
  Zod compartilhado, de onde vêm os tipos com que o web fala com a API
