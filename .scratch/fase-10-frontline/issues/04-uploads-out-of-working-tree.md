# 04: Diretório de uploads fora do working tree

**What to build:** o operador faz `git pull` sem que ele aborte por permissão, e os arquivos
enviados sobrevivem a um `git clean -fd`. Hoje o diretório de dados fica dentro do repo clonado,
onde o git escreve como o usuário do host e o container como outro — não há dono que satisfaça
os dois. Já causou dois incidentes: um `git pull` abortado deixando o checkout pela metade, e
uma falha de permissão no seed.

**Blocked by:** 01 (sequenciamento: edita o mesmo bloco de serviço).

**Status:** ready-for-agent

- [x] O diretório de dados fica fora do working tree, e entra por bind mount declarado.
- [x] O uid esperado está documentado no guia de deploy, ou é fixado no serviço para não
      depender do usuário da imagem base.
- [x] Nenhum caminho gravado no banco muda: ele guarda a chave do arquivo, nunca a URL.
- [x] O guia de deploy descreve a migração do diretório existente, sem perder arquivo.
- [ ] **Verificação manual:** com a stack de pé, enviar uma imagem, rodar `git clean -fd` e
      provar que o arquivo continua servido.

## O que foi feito

Os dois caminhos que o segundo critério oferecia ("ou") foram tomados, não um: o uid está
**fixado** (`user: "1000:1000"` no serviço `api` de produção) *e* documentado no guia. É o mesmo
número dos dois lados — o do `chown` e o do processo — e escrevê-lo num só deixaria o outro
adivinhando.

Além do pedido, duas coisas que o critério não nomeia mas sem as quais ele não se sustenta:

- **`uploads/.gitkeep` foi removido** e o `.gitignore` passou a ignorar `uploads/` inteiro.
  Enquanto o git versionasse aquele caminho, ele continuaria dono dele em *todo* clone — e era
  justamente o `.gitkeep` que o `pull` do servidor não conseguia escrever. Tirar o mount de lá
  sem tirar o arquivo teria consertado o upload e deixado o incidente de pé.
- **`UPLOAD_HOST_DIR` perdeu o fallback `:-./uploads`.** Ele era o caminho silencioso de volta
  para dentro da árvore: variável esquecida no `.env.production` e o bug volta sem aviso. Agora
  o `prod:up` falha nomeando a variável, como a rede `proxy` já faz.

O racional permanente está em `docs/context/infrastructure.md` § "O diretório de uploads mora
fora do working tree, e o uid é fixado no serviço", com a linha correspondente no índice.

### Verificado localmente (2026-09-06)

Esta máquina é a de desenvolvimento, não o servidor — o que dava para provar aqui, foi:

```sh
# 1. sem a variável, o up falha nomeando-a:
#    "required variable UPLOAD_HOST_DIR is missing a value: obrigatorio - caminho
#     absoluto FORA do working tree, ex. /srv/pet-oasis-data/uploads"
docker compose -p pet-oasis-prod --env-file <sem-a-var> \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml config

# 2. com ela, o serviço renderiza `user: 1000:1000` e
#    source: /srv/pet-oasis-data/uploads → target: /app/uploads

# 3. git deixou de ser dono do caminho:
mkdir -p uploads/products/abc && echo byte > uploads/products/abc/foto-full.webp
git ls-files uploads/   # vazio — nada rastreado
git clean -fd           # o arquivo sobrevive
```

O que **falta** é a verificação de ponta a ponta no servidor, porque ela precisa da stack de
produção real e do `.env.production`: subir, enviar uma imagem pelo endpoint, rodar `git clean
-fd` no repo clonado e conferir que a URL continua servindo o byte. O procedimento de migração
do diretório existente (com a stack parada, `mv -T`, `chown`, conferência de contagem antes e
depois) está em `docs/guides/deploy.md` § "Diretório de uploads".
