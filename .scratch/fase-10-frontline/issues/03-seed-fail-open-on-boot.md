# 03: Seed deixa de ser fatal no boot

**What to build:** uma falha ao semear dado de demonstração vira uma linha de log, não a API
inteira fora do ar. Hoje o entrypoint trata falha de seed como fatal: um erro de permissão ao
gravar imagem de catálogo pôs o container em crash loop e a API inteira em 502 no proxy — por
causa de dado de demonstração. Contraria a degradação fail-open já adotada para os destinos
externos de observabilidade.

**Blocked by:** 01 (sequenciamento: edita o mesmo bloco de serviço).

**Status:** ready-for-agent

- [ ] O seed sai do caminho crítico do boot — passo one-shot, ou serviço dedicado que não
      reinicia.
- [ ] Se permanecer no entrypoint, é fail-open: loga em nível de erro e segue para o start do
      servidor.
- [ ] O servidor sobe e responde mesmo com o seed falhando.
- [ ] O guia de deploy descreve como rodar o seed quando ele deixa de ser automático.
- [ ] **Verificação manual:** provocar a falha (permissão negada no diretório de upload) e
      provar que a API sobe e responde.
