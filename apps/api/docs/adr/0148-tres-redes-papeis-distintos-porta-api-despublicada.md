# Três redes com papéis distintos, e a porta da API despublicada (10.2, revisto na 10.17)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Ambientes*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Produção declara **três** redes, e a API é o único serviço nas três — é ela que atravessa a
fronteira entre os dados e quem os pede:

| Rede | Quem entra | Para quê |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | onde os dados vivem, sem rota para a internet |
| `pet-oasis` (`external: true`, `name:` explícito) | `api` + clientes internos | o endereço que um cliente no mesmo VPS usa |
| `proxy` (`external: true`) | `api` + o reverse proxy + clientes internos que ele serve | por onde o público entra — o proxy aponta para `pet-oasis-api`, nunca para `api` |

O `internal: true` é o que faz um cliente na rede compartilhada **não** alcançar Postgres nem
Redis: estar na `pet-oasis` dá acesso à API, e só. A API mantém saída para a internet (SMTP) pelas
outras duas, que não são internas. O `name: pet-oasis` é **contrato**: é o que o compose do
cliente escreve como `external: true`, e é esse nome que o `up` dele procura.

**O alias `api` existe só nas redes do projeto.** Na `backend` e na `pet-oasis` ele é contrato —
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

**As duas redes compartilhadas são `external:`, criadas uma vez no host.** A `pet-oasis` nasceu
gerenciada por este compose (o `name:` só derrubava o prefixo `pet-oasis-prod_`), e a 10.17
corrigiu isso: rede que liga stacks diferentes vive mais que qualquer uma delas, e uma rede que o
`prod:down` apaga é uma rede que o cliente não pode declarar externa sem herdar o ciclo de vida
da API. O incidente tinha uma janela precisa, medida com duas stacks reais: com o front plugado,
o `down` tenta remover a rede, recebe "Resource is still in use" e desiste — nada acontece. Com
as **duas** stacks fora, a rede vai junto, e o front passa a recusar subir (`declared as
external, but could not be found`) até a API voltar — que é exatamente o cenário de um redeploy
conjunto ou de reconstruir o host. Havia um atalho tentador: o Compose só remove rede que ele
próprio criou, então bastaria criá-la à mão antes do primeiro `up` e não mexer no YAML. Foi
descartado por ser regra invisível — o primeiro `prod:up` que rodasse antes do `create` em algum
host a rotularia, e ela voltaria a ser apagável sem nenhum sinal. Declará-la `external:` torna o
contrato legível no próprio compose e faz o `up` falhar nomeando a causa, a mesma política da
`proxy`. Passo de criação e transição de host antigo no [guia de deploy](../guides/deploy.md#redes).

**A porta 3000 deixou de ser publicada no host em produção** — o nginx alcança a API por DNS de
container, então a publicação não tinha mais função. Isso não é higiene: é a metade que torna
segura a outra metade da decisão, o `trust proxy` por endereço privado registrado em
[`0123`](0123-trust-proxy-endereco-origem-nao-contagem-saltos.md). `API_PORT` sobrevive **só em dev**, onde publicar é como o navegador
e o Bruno alcançam a API na máquina de quem desenvolve.

Dev não herda a topologia, de propósito: lá `db` e `redis` publicam porta para o tooling do host
(prisma, vitest), o que é o oposto de `internal: true`. E a rede do proxy não pode ser declarada no
compose **base** porque `external: true` exige que ela exista — declará-la ali quebraria o
`pnpm run dev` de quem nunca subiu um nginx.
