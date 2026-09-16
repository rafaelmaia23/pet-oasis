# 02: Três redes, porta despublicada, e o IP do visitante

**What to build:** o IP de quem visita a loja chega íntegro ao rate limit, ao account lockout e
ao audit log — mesmo quando quem abre a conexão é o container de um cliente que renderiza no
servidor. Hoje todos os visitantes colapsam num IP só, dividem o mesmo balde e envenenam a
trilha de auditoria. Junto, a topologia de rede deixa de ser montada à mão a cada deploy.

As três partes são **uma decisão só** e não podem ser separadas: confiar em endereço privado
só é seguro com a porta despublicada, e fazer uma sem a outra cria um estado intermediário em
que a API confia num header forjável pela internet.

**Blocked by:** 01 (sequenciamento, não dependência lógica: as duas editam o mesmo bloco de
serviço, e fazer esta antes significa escrever o trecho duas vezes).

**Status:** fechada em 2026-09-05

- [x] Três redes declaradas, com papéis distintos: uma interna sem rota para a internet com
      banco, cache e API; uma nomeada e dedicada, compartilhada com clientes internos; e a rede
      externa do reverse proxy, declarada em vez de conectada à mão.
- [x] Um cliente na rede compartilhada **não** alcança Postgres nem Redis.
- [x] A porta da API deixa de ser publicada no host em produção; o reverse proxy passa a
      alcançá-la por DNS de container. A variável de porta sobrevive só em dev.
- [x] A confiança em proxy passa a ser por **endereço de origem**, não por contagem de saltos:

      app.set("trust proxy", ["loopback", "uniquelocal"])

      A contagem não serve porque duas cadeias passam a coexistir — visitante→proxy→API, com um
      salto, e visitante→proxy→cliente→API, com dois — e nenhum número único acerta as duas.
      Por endereço, o framework caminha o header da direita para a esquerda pulando os
      confiáveis e para no primeiro que não é.
- [x] Consequência de contrato, documentada no guia de integração: o cliente pode **copiar ou
      acrescentar** ao header, tanto faz. Isso é deliberado — transformar um detalhe de
      implementação do cliente em pré-requisito de segurança da API é o acoplamento que este
      item existe para evitar.
- [x] Teste cobrindo os **três** caminhos (direto, via proxy, via cliente com salto extra),
      afirmando o endereço que a API grava na linha de sessão e no audit log. Sem rota de eco
      criada só para o teste. Erro aqui é silencioso e envenena a trilha sem ninguém perceber.
- [x] O passo manual `docker network connect` some do procedimento de deploy, e o guia registra
      isso.
- [x] **Verificação manual:** subir a stack e provar que a porta não responde de fora e que o
      proxy continua alcançando a API.

> **Verificação manual feita em 2026-09-05**, com a stack de produção de pé
> (`npm run prod:up`) e a rede `proxy` criada antes:
>
> - Sem a rede `proxy`, o `up` recusa com `network proxy declared as external, but could not be
>   found` — o passo manual não é mais esquecível em silêncio.
> - `docker port pet-oasis-api` vazio, e `curl http://127.0.0.1:3000/api/v1/status` do host não
>   conecta: a porta não responde de fora.
> - De um container na rede `proxy` (o lugar do nginx): `http://api:3000/api/v1/status` → **200**.
> - De um container na rede `pet-oasis` (o lugar do front): **200** na API, e `db`/`redis`
>   **inalcançáveis** — nem por DNS (`bad address 'db'`) nem pelo IP deles na `backend`.
> - Ponta a ponta do IP, que o teste em processo não alcança porque lá a conexão é sempre
>   loopback: um login recusado vindo da rede `proxy` (endereço real de bridge, `172.x`) com
>   `X-Forwarded-For: 203.0.113.7, 10.42.0.9` gravou `ip = 203.0.113.7` em `audit_logs`. É a
>   prova de que `uniquelocal` cobre a faixa do Docker na prática, e não só no papel.

Roteiro, para repetir:

```sh
docker network create proxy      # uma vez por host
npm run prod:up
docker port pet-oasis-api                                    # vazio
curl -m3 http://127.0.0.1:3000/api/v1/status                 # não conecta
docker run --rm --network proxy alpine \
  sh -c 'apk add -q curl && curl -so /dev/null -w "%{http_code}\n" http://api:3000/api/v1/status'
docker run --rm --network pet-oasis alpine \
  sh -c 'nc -z -w2 db 5432 && echo FALHA || echo "db inalcancavel (esperado)"'
npm run prod:down
```
