# O boot para no dado de referência e segue no de demonstração (10.3)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O entrypoint faz `migrate deploy → seed → start` com `set -e`, e por muito tempo isso significou
que **qualquer** falha do seed derrubava o boot. Uma falha de permissão ao gravar imagem do
catálogo fake pôs o container em crash loop e a API inteira em 502 no proxy — por causa de dado de
demonstração. Tratar isso como fatal contradizia a degradação já adotada nos destinos externos de
observabilidade e no audit log.

A correção não é "seed nunca derruba o boot": é uma fronteira dentro do seed, e ela é contrato.

- **Dado de referência** — features, roles, raças e o léxico da busca — continua **fatal**. É
  pré-requisito da API do mesmo jeito que a migration: subir com a tabela de autorização pela
  metade é pior que não subir, e o crash loop é o sinal alto que faz alguém olhar.
- **Dado de demonstração** — o usuário demo, o admin de teste e o dataset fake, todos atrás de flag
  de env — é **fail-open**: `runOptionalSeedStep` (`src/lib/seed/optionalSeedStep.ts`) loga em nível
  de erro, devolve o passo como falho e o seed segue para o próximo.

O fail-open não é silencioso em nenhum dos dois níveis: o passo falho vai para `failedOptionalSteps`
no `SeedResult`, e a última linha do seed passa a ser `SEEDING COMPLETED WITH FAILURES: <passos>` em
vez de um `COMPLETED` que mentiria. É a linha que o operador lê no `prod:logs`, e é o que diz que
falta rodar o seed à mão depois de arrumar a causa.

Os passos opcionais são quatro, e a granularidade tem razão: `fake-users-and-pets` é **um** passo
porque os pets se amarram aos customers fake por email — usuários no chão tornam os pets impossíveis,
e insistir só produziria um segundo erro derivado do primeiro. `fake-catalog` é passo separado
porque é independente dos dois, e é justamente onde a falha que originou a issue acontece.

O `demo-reset` **não** herda o fail-open: ele trunca tudo antes de resemear, então um passo falho ali
deixa a demo sem aquele dado até o timer do dia seguinte. O script loga em erro e sai com **1**, para
o systemd marcar a unit como falha em vez de verde, e os passos falhos entram na metadata da linha
`DEMO_RESET_EXECUTED` — o log de erro some com a rotação, a linha de audit não. O fail-open é sobre
não derrubar o **boot**; o timer de manutenção não é o boot.
