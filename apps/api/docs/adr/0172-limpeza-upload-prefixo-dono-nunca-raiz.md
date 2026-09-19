# A limpeza de upload é por prefixo de dono, nunca a raiz (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O `demo-reset` passou a limpar o `UPLOAD_DIR`, e a versão óbvia quebraria só onde importa:
`storage.deleteDirectory("")` resolve para o próprio root — o guard de `resolveInsideRoot` permite
`resolved === this.root` — e o `fs.rm` recursivo tentaria remover o **ponto de montagem do bind
mount** (`/app/uploads`). Em dev, sem mount, ele apaga e o `put` recria; em produção falha com
`EBUSY`.

A limpeza itera `Object.keys(IMAGE_DIMENSIONS)` em vez de listar três strings, para que um dono novo
da Fase 10 (imagem de serviço, comprovante de pedido) entre sozinho sem ninguém lembrar de voltar
ao script.
