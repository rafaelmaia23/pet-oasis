# 03: Alcançar a API real, com tipos e prova ponta a ponta

**What to build:** a aplicação fala com a API de verdade e mostra dado real numa página. E
existe a infraestrutura de teste que prova isso automaticamente, contra a API subida em
Docker.

Este é o tracer bullet da comunicação: atravessa configuração de ambiente, cliente HTTP,
tipos gerados, renderização no servidor e teste ponta a ponta — usando um endpoint público,
sem envolver autenticação.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Tipos gerados da especificação OpenAPI da API e **versionados** no repositório
- [ ] Script de regeneração dos tipos, funcionando contra a API local e contra a publicada
- [ ] O build **não** depende de a API estar de pé
- [ ] Cliente HTTP único e tipado, ponto exclusivo de contato com a API
- [ ] O cliente resolve o endereço por ambiente: **rede interna do Docker** nas chamadas do
      servidor; endereço público apenas para URL de imagem
- [ ] O cliente repassa o IP do visitante no cabeçalho de encaminhamento. A API ainda o
      ignora, e nada quebra por isso
- [ ] O cliente converte o envelope de erro da API numa forma única que a interface consome
- [ ] A conversão do envelope de erro é testada como função pura
- [ ] Um Server Component exibe dado real vindo de um endpoint público da API
- [ ] Playwright configurado para subir a API pela composição Docker do repositório dela e
      **derrubar ao final, inclusive em caso de falha**
- [ ] Um teste ponta a ponta prova que a página renderiza o dado real
- [ ] Vitest configurado para os testes de costura e de função pura
