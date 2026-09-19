# O serviço do Compose se chama `api`, com alias de rede explícito (10.1)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O nome do serviço **é** o endereço: o Compose o publica no DNS da rede, então é o que um cliente
interno escreve no código. Enquanto o serviço se chamou `app`, o DNS publicava `app` — e o front
(`pet-oasis-web`), cujo ADR já dizia `http://api:3000`, teria falhado em resolução de DNS no
primeiro deploy conjunto. Renomear o serviço para `api` (container de produção `pet-oasis-api`,
o de dev `pet-oasis-dev-api`) é o que torna verdadeiro um contrato já publicado do outro lado.

Um **alias de rede explícito** é declarado no compose base, apesar de o Compose já criar um
implícito com o nome do serviço. O motivo é o modo de falha: DNS que some numa renomeação não
grita — o cliente vê `ENOTFOUND` e a causa fica a três camadas de distância. Declarado, o
endereço `api` sobrevive a um rename futuro do serviço.

O que **não** foi renomeado, de propósito: o `WORKDIR /app` e os caminhos montados dentro do
container (são sistema de arquivos, não serviço — renomear quebra os bind mounts) e `APP_URL`
(é a URL pública do **cliente**, e sempre quis dizer isso). Só a variável da porta publicada no
host acompanhou o serviço: `APP_PORT` → `API_PORT`.

Renomear um serviço **órfã o container antigo**: ele continua rodando, com o rótulo do projeto
compose mas sem serviço correspondente na config, e o `down` não o leva junto — o próximo `up`
falha por porta já alocada, e o diagnóstico ("port is already allocated") não aponta para a
renomeação. Por isso `dev`, `dev:down`, `dev:reset`, `prod:up` e `prod:down` passaram a levar
`--remove-orphans`: a limpeza vira parte do ciclo normal, e a próxima renomeação não repete o
episódio.

O nome do container de produção está **gravado nos três systemd units** de `infra/cron/`
(`docker exec pet-oasis-api …`), que por isso precisam ser reinstalados **antes** do deploy que
renomeia — procedimento e verificação manual em [`infra/cron/README.md`](../../infra/cron/README.md).
Unit apontando para container inexistente falha de um jeito que não acorda ninguém.
