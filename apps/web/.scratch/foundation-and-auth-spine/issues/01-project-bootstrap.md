# 01: Bootstrap do projeto, do repositório e do container de produção

**What to build:** o projeto existe, sobe em desenvolvimento e sobe em produção. Uma pessoa
consegue clonar o repositório, rodar um comando e ver uma página no navegador; e a mesma
página é servida por uma imagem de produção no mesmo network Docker da API.

Nada de domínio ainda. Este é o "make the change easy" de todos os tickets seguintes.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Repositório Git inicializado, com `main` criada
- [x] Next 16 com App Router e TypeScript em modo estrito
- [x] Tailwind 4 no modo CSS-first; **não existe `tailwind.config.js`**
- [x] Biome como única ferramenta de lint e formatação, com as regras do domínio `next` ativas
- [x] Nenhum ESLint e nenhum Prettier no projeto
- [x] O comando de desenvolvimento sobe a aplicação na **porta 3001** e serve uma página
- [x] Verificação de tipos e lint passam limpos
- [x] O arquivo de exclusões do Git cobre dependências, artefatos de build e arquivos de ambiente
- [x] Imagem de produção em modo standalone
- [x] Composição de produção coloca o container no mesmo network Docker da API
- [x] A imagem de produção sobe e serve a mesma página que o desenvolvimento

## Comments

Entregue em `feat/01-project-bootstrap`, merge `--no-ff` na `main`.

Next 16.3.4 / React 19.2.8 / Biome 2.5.12 / Node 24. O `tsconfig` vai além do `strict`:
carrega o mesmo conjunto extra do repo da API (`noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`), para que uma regra aprendida lá
continue valendo aqui.

Duas coisas que a revisão levantou e que ficam registradas porque parecem erro e não são:

- **`allowJs: true` no `tsconfig.json` e o bloco `nextjs-agent-rules` no `CLAUDE.md`** são
  repostos pelo próprio Next a cada `build` / `dev`. Removê-los não os elimina: só recria uma
  mudança não commitada. Ambos estão comentados no lugar onde aparecem.
- **`npm run typecheck` roda `next typegen` antes do `tsc`.** `LayoutProps` e companhia são
  globais gerados pelo Next; sem o typegen, um clone limpo falha a verificação de tipos antes
  do primeiro build.

Um bug real foi pego na revisão: o `Dockerfile` copiava `next-env.d.ts`, que é gerado e
ignorado pelo Git. A imagem só subia em máquina onde o arquivo já existia — CI e VPS
quebrariam. Corrigido e verificado clonando a branch num diretório limpo e buildando de lá.

O ticket 02 herda um `globals.css` que é só `@import "tailwindcss"`: nenhuma cor foi
introduzida, então nada nasceu sem par escuro.
