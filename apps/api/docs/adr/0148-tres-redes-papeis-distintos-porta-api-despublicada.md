# Três redes com papéis distintos, e a porta da API despublicada (10.2, revisto na 10.17 e na 11.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.
> **Revisto em 2026-09-21 (11.11):** com o web importado para o monorepo, o stack Compose
> passou a ser um só (`infra/` da raiz) e a rede entre a API e o web deixou de ser externa —
> a seção sobre a `pet-oasis` abaixo narra a reversão.

Produção declara **três** redes, e a API é o único serviço nas três — é ela que atravessa a
fronteira entre os dados e quem os pede:

| Rede | Quem entra | Para quê |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | onde os dados vivem, sem rota para a internet |
| `frontend` (do stack) | `api` + `web` | o endereço que um cliente interno usa (`http://api:3000`) |
| `proxy` (`external: true`) | `api`, `web` e o reverse proxy | por onde o público entra — o proxy aponta para `pet-oasis-api` e `pet-oasis-web`, nunca para `api`/`web` |

O `internal: true` é o que faz o web **não** alcançar Postgres nem Redis: estar na `frontend`
dá acesso à API, e só. A API mantém saída para a internet (SMTP) pelas outras duas, que não são
internas.

**O alias `api` existe só nas redes do projeto.** Na `backend` e na `frontend` ele é contrato —
é o que o front escreve (`http://api:3000`), e o alias explícito é o que faz uma renomeação do
serviço falhar alto em vez de em ENOTFOUND silencioso. Na `proxy` ele foi **removido** depois
do primeiro deploy da fase: a rede é compartilhada com todo projeto que o reverse proxy serve no
host, e `api` é justamente o nome genérico que um segundo projeto declararia — dois aliases
iguais viram round-robin no DNS do Docker, e o proxy alterna entre as duas APIs sem nenhum erro.
O proxy host aponta para o nome do container, `pet-oasis-api`. O nome do serviço continua
resolvendo na `proxy` (o Compose sempre o publica), então a remoção reduz a colisão em vez de
eliminá-la — eliminar exigiria renomear o serviço, e reabriria a 10.1 por um risco hipotético.

A rede do nginx é **declarada** em vez de conectada à mão. O passo manual que existia
(`docker network connect` depois de cada deploy) falhava do pior jeito possível: esquecê-lo deixa
a API inalcançável pelo público com o container de pé e o healthcheck verde, ou seja, sem nenhum
sinal apontando para a causa. Declarada, ou o `up` sobe conectado ou falha dizendo que a rede não
existe.

**A rede entre a API e o web foi externa enquanto foram dois stacks — e voltou a ser do stack
quando passaram a ser um.** Entre a 10.17 e a 11.11 ela se chamava `pet-oasis` (`external: true`,
`name:` explícito) e era criada uma vez no host: rede que liga stacks diferentes vive mais que
qualquer uma delas, e uma rede que o `prod:down` da API apaga é uma rede que o cliente não pode
declarar externa sem herdar o ciclo de vida da API. O incidente tinha uma janela precisa, medida
com duas stacks reais: com o front plugado, o `down` tenta remover a rede, recebe "Resource is
still in use" e desiste — nada acontece. Com as **duas** stacks fora, a rede vai junto, e o front
passa a recusar subir (`declared as external, but could not be found`) até a API voltar — que é
exatamente o cenário de um redeploy conjunto ou de reconstruir o host. O atalho de criá-la à mão
sem mexer no YAML foi descartado por ser regra invisível.

A 11.11 dissolveu a premissa em vez de contorná-la: com o web importado para o monorepo, API e
web sobem pelo **mesmo** stack (`infra/docker-compose.prod.yml` da raiz, projeto
`pet-oasis-prod`), e a rede entre eles — agora `frontend` — é do stack: nasce no `up`, morre no
`down`, e "o up do web falhou porque a rede da API não existe" deixou de ser possível por
construção. Deploy de um serviço só (`pnpm prod:up api`) não toca a rede, porque o `up` de um
serviço não remove nada. O que a 10.17 ensinou continua valendo para o que **ainda** liga stacks
diferentes: a `proxy`, do nginx, segue `external:`, criada uma vez no host, e é a única rede que
o guia de deploy manda criar. A `pet-oasis` externa que ficou no host antigo é removida na
transição de host — passo que entra no [guia de deploy](../guides/deploy.md#redes) na reescrita
dele para o monorepo (issue 13 da Fase 11).

**A porta 3000 deixou de ser publicada no host em produção** — o nginx alcança a API por DNS de
container, então a publicação não tinha mais função. Isso não é higiene: é a metade que torna
segura a outra metade da decisão, o `trust proxy` por endereço privado registrado em
[`0123`](0123-trust-proxy-endereco-origem-nao-contagem-saltos.md). `API_PORT` sobrevive **só em dev**, onde publicar é como o navegador
e o Bruno alcançam a API na máquina de quem desenvolve.

Dev não herda a topologia, de propósito: lá `db` e `redis` publicam porta para o tooling do host
(prisma, vitest), o que é o oposto de `internal: true`. E a rede do proxy não pode ser declarada no
compose **base** porque `external: true` exige que ela exista — declará-la ali quebraria o
`pnpm run dev` de quem nunca subiu um nginx.
