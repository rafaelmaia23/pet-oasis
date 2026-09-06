# 17: `prod:down` leva junto a rede que o front declara como externa

**What to build:** decidir o dono da rede `pet-oasis` e alinhar compose e guia.

A 02 declarou três redes. A `proxy` é `external:` — criada uma vez, fora do repositório, e o `up`
falha se ela não existir, que é a mensagem certa. A `pet-oasis` **não** é: ela é gerenciada pelo
projeto (o `name:` só derruba o prefixo). O guia de deploy diz isso na tabela ("Criada por: o
próprio `prod:up`") e, três parágrafos abaixo, manda o cliente interno declará-la `external: true`.

As duas frases não convivem. `npm run prod:down` apaga a rede; o compose do front, que a declara
externa, passa a recusar subir até que a API volte. Um deploy da API vira um pré-requisito para
subir o front — acoplamento que a rede dedicada existia para evitar, e que aparece no pior
momento (durante uma manutenção da API).

A `proxy` já resolve isso do jeito certo, e pela mesma razão: rede compartilhada entre stacks tem
vida mais longa que qualquer uma delas.

**Blocked by:** None. Nada quebra hoje porque o front ainda não subiu ao lado da API — o custo é
zero **antes** do primeiro deploy conjunto, e é um incidente depois.

**Status:** needs-triage

**Triagem:** needs-triage — o descompasso é certo; se o conserto é tornar a rede externa ou
reescrever o contrato do cliente, é decisão.

- [ ] Compose e guia dizem a mesma coisa sobre quem cria e quem apaga a `pet-oasis`.
- [ ] `prod:down` seguido de `prod:up` não deixa o cliente interno sem rede em momento nenhum —
      ou, se deixar por decisão, o guia diz isso com todas as letras e diz o que o cliente faz.
- [ ] Se a rede virar `external:`, o passo de criação entra ao lado do `docker network create
      proxy`, no mesmo bloco e com a mesma justificativa.
