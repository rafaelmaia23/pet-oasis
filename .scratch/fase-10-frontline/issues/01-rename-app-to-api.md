# 01: Renomear o serviço `app` para `api`

**What to build:** um cliente interno resolve a API pelo nome `api` e a alcança. Hoje o serviço
do Compose se chama `app`, então o DNS da rede publica `app`, e a chamada que o front já tem
escrita falharia em resolução de DNS no primeiro deploy conjunto. O nome do serviço vira alias
de rede automático, então renomear é o que faz o contrato já publicado do outro repo passar a
ser verdade.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-05

- [x] O serviço se chama `api` nos três arquivos de Compose (base, dev, prod) e o container de
      produção se chama `pet-oasis-api`; o de dev acompanha.
- [x] Um alias de rede explícito `api` é declarado, em vez de depender do comportamento
      implícito do Compose — DNS que falha em silêncio é o modo de falha caro aqui.
- [x] A variável de porta passa a se chamar `API_PORT`, no arquivo de exemplo de ambiente e em
      todo consumidor.
- [x] **Não** são renomeados: o diretório de trabalho dentro do container, os caminhos internos
      montados, e a variável que guarda a URL pública do cliente. Confundir esses três é o jeito
      de quebrar os bind mounts e os emails.
- [x] Os três arquivos de serviço systemd apontam para o container novo.
- [x] O procedimento de remover as units antigas e instalar as novas está escrito no README de
      agendamento, com a ordem (reinstalar **antes** do deploy que renomeia) e um passo de
      execução manual de verificação.
- [x] Guia de deploy e README mencionam o nome novo; uma varredura prova que nenhuma menção ao
      nome antigo sobrou fora de prosa histórica.
- [x] **Verificação manual** (não há teste automatizado — isto vive no Docker): subir a stack de
      produção e provar de outro container na mesma rede que `api` resolve e responde.

> Verificação manual **feita em 2026-09-05**, com os dois caminhos que dependem do nome novo:
> um container avulso na rede da stack alcançou `http://api:3000/openapi.json` (**200**, sem
> `ENOTFOUND`), e `docker exec pet-oasis-api node dist/cleanup-sessions.js --dry-run` — a forma
> exata que os systemd units usam — rodou e logou. O roteiro, para repetir:

```sh
npm run prod:up
# de um container qualquer na mesma rede, sem publicar porta nenhuma:
docker run --rm --network pet-oasis-prod_default alpine \
  sh -c 'apk add -q curl >/dev/null && curl -sSo /dev/null -w "%{http_code}\n" http://api:3000/openapi.json'
npm run prod:down
```

Espera-se resolução de DNS (sem `ENOTFOUND`) e resposta da API. `docker exec pet-oasis-api ...`
também deve funcionar — é a forma que os systemd units de `infra/cron/` usam.
