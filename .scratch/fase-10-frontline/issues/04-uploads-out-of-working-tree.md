# 04: Diretório de uploads fora do working tree

**What to build:** o operador faz `git pull` sem que ele aborte por permissão, e os arquivos
enviados sobrevivem a um `git clean -fd`. Hoje o diretório de dados fica dentro do repo clonado,
onde o git escreve como o usuário do host e o container como outro — não há dono que satisfaça
os dois. Já causou dois incidentes: um `git pull` abortado deixando o checkout pela metade, e
uma falha de permissão no seed.

**Blocked by:** 01 (sequenciamento: edita o mesmo bloco de serviço).

**Status:** ready-for-agent

- [ ] O diretório de dados fica fora do working tree, e entra por bind mount declarado.
- [ ] O uid esperado está documentado no guia de deploy, ou é fixado no serviço para não
      depender do usuário da imagem base.
- [ ] Nenhum caminho gravado no banco muda: ele guarda a chave do arquivo, nunca a URL.
- [ ] O guia de deploy descreve a migração do diretório existente, sem perder arquivo.
- [ ] **Verificação manual:** com a stack de pé, enviar uma imagem, rodar `git clean -fd` e
      provar que o arquivo continua servido.
