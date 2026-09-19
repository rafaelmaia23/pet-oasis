# O OpenSSL vai nos três estágios da imagem, e a engine do Prisma é detectada (10.5)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`node:22-bookworm-slim` não traz o binário `openssl` nem o libssl — o Node linka o seu
estaticamente. Sem eles a detecção de libssl do Prisma falha, e o default silencioso é o
schema-engine `debian-openssl-1.1.x`. Rodava, porque a engine só é exercida no `migrate deploy` do
entrypoint, mas o log de inicialização abria com dois blocos de warning e a engine era a errada
escolhida por acidente — acidente que muda de resultado em ARM64 ou num bump da imagem base.

O `openssl` é instalado nos **três** estágios, porque a escolha acontece duas vezes em cada
imagem: no `pnpm install`, onde o `@prisma/engines` decide qual build do schema-engine baixar, e no boot,
onde o CLI redetecta. Instalar só no runtime faria os dois discordarem — a detecção pediria 3.0.x e
a imagem carregaria o binário 1.1.x, que é o caso pior dos dois. O estágio `dev` entrou logo
depois, pelo mesmo motivo pelo outro caminho: o `docker-entrypoint.dev.sh` roda `prisma generate` e
`migrate deploy`, então todo `pnpm run dev` também abria com os dois blocos de warning. Lá o custo é
**negativo** — a engine 3.0.x é menor que a 1.1.x o bastante para pagar a camada do apt e sobrar
(1368,56 MB → 1365,90 MB).

**Detectar, e não pinar** com `PRISMA_CLI_BINARY_TARGETS`: o alvo carrega a arquitetura junto da
versão do SSL (`debian-openssl-3.0.x` contra `linux-arm64-openssl-3.0.x`), então fixá-lo calaria o
warning e congelaria justamente a fragilidade em ARM64 que motivou o item. Custo medido: +7,34 MB
da camada do apt, −5 MB da engine menor que a anterior, +2,34 MB líquidos numa imagem de ~942 MB.
