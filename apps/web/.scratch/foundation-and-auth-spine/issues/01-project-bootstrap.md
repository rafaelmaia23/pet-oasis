# 01: Bootstrap do projeto, do repositório e do container de produção

**What to build:** o projeto existe, sobe em desenvolvimento e sobe em produção. Uma pessoa
consegue clonar o repositório, rodar um comando e ver uma página no navegador; e a mesma
página é servida por uma imagem de produção no mesmo network Docker da API.

Nada de domínio ainda. Este é o "make the change easy" de todos os tickets seguintes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Repositório Git inicializado, com `main` criada
- [ ] Next 16 com App Router e TypeScript em modo estrito
- [ ] Tailwind 4 no modo CSS-first; **não existe `tailwind.config.js`**
- [ ] Biome como única ferramenta de lint e formatação, com as regras do domínio `next` ativas
- [ ] Nenhum ESLint e nenhum Prettier no projeto
- [ ] O comando de desenvolvimento sobe a aplicação na **porta 3001** e serve uma página
- [ ] Verificação de tipos e lint passam limpos
- [ ] O arquivo de exclusões do Git cobre dependências, artefatos de build e arquivos de ambiente
- [ ] Imagem de produção em modo standalone
- [ ] Composição de produção coloca o container no mesmo network Docker da API
- [ ] A imagem de produção sobe e serve a mesma página que o desenvolvimento
