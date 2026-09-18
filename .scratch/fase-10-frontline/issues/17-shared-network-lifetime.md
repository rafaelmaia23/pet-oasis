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

**Status:** fechada em 2026-09-16

**Decisão:** decidido em 2026-09-16: a `pet-oasis` vira `external: true`, criada
uma vez no host ao lado da `proxy`, pelo mesmo motivo. As alternativas descartadas: manter a API
como dona e reescrever o contrato do cliente (acopla o deploy do front ao da API em definitivo — o
front não sobe nem uma página de manutenção com a API fora); e só documentar "crie a rede à mão
antes do primeiro `prod:up`" sem mexer no compose (funciona, ver abaixo, mas depende da ordem de
bootstrap e de comportamento implícito do Compose — regra invisível que quebra em silêncio).

**O que os testes com duas stacks reais (Compose v5.5.1) mostraram** — vale como referência para
quem escrever o guia:

- `down` da API **com o front plugado** tenta remover a rede, recebe "Resource is still in use" e
  desiste: a rede fica e o front segue. O incidente só acontece com **as duas stacks fora e o front
  subindo primeiro** — que é exatamente redeploy conjunto ou reconstrução do host.
- `down` da API com o front fora apaga a rede; o `up` do front então falha com `network pet-oasis
  declared as external, but could not be found`.
- Rede pré-criada à mão (sem labels do Compose) é reutilizada pelo `up` e **não** é removida pelo
  `down` — o Compose só apaga rede que ele próprio criou. É por isso que a alternativa "só
  documentar" funcionaria; e é por isso que ela é frágil: se um `prod:up` rodar antes da criação
  manual em algum host, a rede nasce rotulada e volta a ser apagável.

**Escopo:**

1. `infra/docker-compose.prod.yml`: `pet-oasis` ganha `external: true` (o `name:` fica); o
   comentário passa a dizer que ela é criada fora do repo, como a `proxy`, e por quê.
2. `docs/guides/deploy.md`, seção Redes: a tabela diz "fora deste repo, uma vez" para as duas; o
   bloco de `docker network create` cria as duas, com a justificativa comum (rede compartilhada
   entre stacks vive mais que qualquer uma delas). O `up` passa a falhar em host virgem se ela não
   existir — a mesma "mensagem certa" que 10.2 defendeu para a `proxy`.
3. `docs/guides/integrating-with-the-api.md`: a frase "a rede é criada pelo compose de produção da
   API; se a API não estiver de pé, o `up` do cliente falha" é reescrita — a rede é do host, o
   front sobe com a API fora, e o passo de criação está no guia de deploy.
4. `docs/context/infrastructure.md`, decisão 10.2: reescrever narrando a mudança (não decisão +
   errata), incluindo o comportamento do `down` com endpoints ativos, que é o que estreita a
   janela do incidente e o que tornaria a alternativa "só documentar" tentadora.
5. No host de produção, antes do primeiro `prod:up` com esta mudança, criar a rede — passo de
   operador, aberto como issue 20 (`20-create-pet-oasis-network-on-host.md`).
6. `npm run docs:check` verde.

- [x] Compose e guia dizem a mesma coisa sobre quem cria e quem apaga a `pet-oasis`.
- [x] `prod:down` seguido de `prod:up` não deixa o cliente interno sem rede em momento nenhum —
      ou, se deixar por decisão, o guia diz isso com todas as letras e diz o que o cliente faz.
- [x] Se a rede virar `external:`, o passo de criação entra ao lado do `docker network create
      proxy`, no mesmo bloco e com a mesma justificativa.
