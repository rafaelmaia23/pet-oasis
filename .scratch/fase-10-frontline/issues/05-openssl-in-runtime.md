# 05: OpenSSL no estágio de runtime

**What to build:** o boot deixa de emitir warning de detecção de OpenSSL, e a engine do Prisma
passa a ser escolha explícita em vez de default silencioso. Funciona hoje, mas é frágil em
ARM64 e em bump de imagem base — o tipo de coisa que quebra num upgrade sem ninguém relacionar
a causa.

**Blocked by:** None (can start immediately). Toca só o Dockerfile, então é a issue de infra que
pode ser feita a qualquer momento, inclusive antes da 01.

**Status:** ready-for-agent

- [x] OpenSSL instalado no estágio de runtime da imagem — **e no de build**, porque a engine é
      escolhida duas vezes (ver a nota abaixo).
- [x] O boot não emite mais o warning de detecção.
- [x] O tamanho da imagem final é registrado antes e depois, para o custo ser conhecido.
- [x] **Verificação manual:** subir o container de produção e ler o log de inicialização.

> **Os dois estágios, não só o runtime.** A escolha da engine acontece no `npm ci` — é ali que o
> `@prisma/engines` detecta o libssl e baixa o build correspondente do schema-engine —, e de novo
> no boot, onde o CLI redetecta para achar o binário. Instalar o `openssl` só no runtime faria os
> dois discordarem: a detecção pediria `3.0.x` e a imagem carregaria o `1.1.x` que o build baixou,
> trocando um warning por um erro. Também se optou por **detectar e não pinar**
> (`PRISMA_CLI_BINARY_TARGETS`): o alvo carrega a arquitetura junto da versão do SSL, então fixá-lo
> congelaria a fragilidade em ARM64 que motivou o item. Racional permanente em
> `docs/context/infrastructure.md` § "O OpenSSL vai nos três estágios da imagem".

> **Tamanho, medido nas duas imagens do estágio `runtime`** (soma das camadas via
> `docker history`; o `docker image ls` arredonda as duas para 1.17 GB e esconde a diferença):
>
> | | antes | depois |
> |---|---|---|
> | imagem | 941,86 MB | 944,20 MB |
> | camada do `apt` | — | +7,34 MB |
> | `node_modules` | 684 MB | 679 MB |
> | engine baked | `schema-engine-debian-openssl-1.1.x` | `schema-engine-debian-openssl-3.0.x` |
>
> Líquido **+2,34 MB (+0,25%)**: o apt custa 7,34 MB e a engine 3.0.x devolve 5 MB por ser menor
> que a 1.1.x.

> **Verificação manual feita em 2026-09-06**, em worktree limpa da própria branch (a checkout
> principal tinha trabalho de outra issue em andamento). Antes: o log abria com dois blocos de
> `prisma:warn Prisma failed to detect the libssl/openssl version to use ... Defaulting to
> "openssl-1.1.x"`. Depois: **zero** linhas de `openssl`/`libssl` no log, e não só num banco já
> migrado — com o volume apagado, as **24 migrations** foram aplicadas uma a uma pela engine nova,
> o seed rodou, o servidor subiu e o healthcheck ficou verde. Roteiro, para repetir:

```sh
docker network create proxy      # uma vez por host
npm run prod:up
docker logs pet-oasis-api | grep -ci 'openssl\|libssl'          # 0
docker run --rm --entrypoint sh <imagem> -c 'openssl version; ls node_modules/@prisma/engines/'
# do zero, para ver as migrations sendo aplicadas pela engine nova:
docker compose -p pet-oasis-prod --env-file .env.production \
  -f infra/docker-compose.yml -f infra/docker-compose.prod.yml down -v
npm run prod:up && docker logs pet-oasis-api
npm run prod:down
```

> **O estágio `dev`, que ficou de fora daqui:** ele tem o mesmo defeito — roda `prisma generate` e
> `migrate deploy` no entrypoint e emite os mesmos warnings —, mas esta issue nomeia o runtime e a
> verificação é do container de produção, então saiu como item próprio do
> `docs/reference/backlog.md` em vez de nota no fim de issue fechada. **Foi feito logo depois**, na
> branch `fix/openssl-in-dev-stage`, com a mesma linha de `apt-get` e um `npm run dev` de verdade
> como verificação; o item do backlog já está riscado.
