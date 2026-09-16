# 20: Criar a rede `pet-oasis` no servidor antes do primeiro `prod:up` da 10.17

**What to build:** um passo de operador, não de código. A 17 tornou a rede `pet-oasis`
`external: true`: o compose de produção passou a **exigir** que ela exista e deixou de criá-la.
Enquanto o servidor não tiver a rede, o primeiro `prod:up` depois do merge falha dizendo isso —
que é a mensagem certa, mas é um deploy quebrado se ninguém rodar o passo antes.

No servidor, antes do `prod:up` que traz a 17:

```bash
docker network create pet-oasis   # inofensivo se já existir: erra dizendo que existe
```

Se a rede já existir criada pelo Compose de uma versão anterior, o `create` erra e está tudo
certo: `external:` só checa existência. Não apague a rede antiga para recriá-la — ela pode estar
com o front plugado.

**Blocked by:** merge da `fase-10` na `dev`/`main` (a rede só precisa existir quando o compose
novo chegar ao servidor). Vai na mesma janela que a 19 e a verificação de ponta a ponta da 04,
que também são passos no servidor.

**Status:** fechada em 2026-09-16

- [x] `docker network inspect pet-oasis` responde no servidor *(rede criada pelo usuário em
      2026-09-16)*.
- [x] `prod:up` com o compose da 17 sobe com a API na rede (`docker network inspect pet-oasis`
      lista o container `pet-oasis-api`).

## Verificação (servidor, 2026-09-16)

Primeiro `prod:up` com o compose da fase, no host `homelab-oracle`, depois de `git pull` da
`main` (`26632d2`). `docker network inspect pet-oasis`: rede `bbf7028e…`, criada à mão em
2026-09-16T17:55Z, `"Labels": {}` (sem rótulo do Compose — é o que a torna imune ao `prod:down`,
como a 17 previu), `"Internal": false`, subnet `172.21.0.0/16`, e em `Containers` o
`pet-oasis-api` (`65ba9d10d315`, `172.21.0.2/16`). Na mesma janela: as units systemd novas
instaladas e a execução manual do `pet-oasis-cleanup-sessions.service` rodou contra o container
novo (`hostname: 65ba9d10d315`, `cleanup-sessions completed`) — o passo 5 do
`infra/cron/README.md`, que a 01 dizia não ser opcional.
