# pet-oasis-web

Frontend web do **Pet Oasis**, uma loja de pet shop. Consome a API REST do repositório irmão
[`pet-oasis-api`](../pet-oasis-api), que é a autoridade de todo o domínio: aqui não há banco,
não há regra de negócio e não há validação que decide.

Next 16 (App Router) · React 19 · TypeScript estrito · Tailwind 4 (CSS-first) · Biome ·
Node 24.

## Rodar em desenvolvimento

```bash
npm install
npm run dev
```

A aplicação sobe **no host, na porta 3001** — a 3000 é da API. Abra
<http://localhost:3001>.

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
| `npm run prod:up` | Sobe o container de produção |
| `npm run prod:down` | Derruba o container de produção |
| `npm run prod:logs` | Acompanha os logs do container de produção |

Antes de commitar: `npm run typecheck` e `npm run lint` limpos.

## Produção

A imagem é multi-stage e serve o bundle **standalone** do Next por `node server.js`, sem CLI
do Next e sem `node_modules` inteiro, como usuário não-root.

O container entra no **mesmo network Docker da API** (ADR-0004), para que toda chamada
server-side vá pela rede interna e nunca pela URL pública. Esse network é criado pelo compose
de produção da API e entra aqui como externo — a API precisa estar de pé antes.

```bash
cp .env.example .env.production   # ajuste WEB_PORT e API_NETWORK
npm run prod:up
```

## Documentação

- [`CLAUDE.md`](CLAUDE.md) — guia de trabalho no repositório
- [`CONTEXT.md`](CONTEXT.md) — glossário do domínio
- [`docs/adr/`](docs/adr/) — decisões estruturais
- [`docs/design-system.md`](docs/design-system.md) — direção visual
- [`.scratch/`](.scratch/) — specs e tickets
