# 19: A receita de migração do `uploads/` descreve um deploy que não existe

**What to build:** remover do guia de deploy a receita "Migrar um deploy que ainda tem `uploads/`
dentro do repo", que a 04 escreveu, e preservar em lugar durável o único fato que a derrubou.

A receita manda, a partir do repo clonado:

```bash
sudo mv -T uploads /srv/pet-oasis-data/uploads
find /srv/pet-oasis-data/uploads -type f | wc -l   # tem de bater com a de antes
```

O caminho está errado: o Compose resolve fonte relativa de bind mount contra o **diretório do
projeto**, que é o do primeiro `-f` — aqui, `infra/`. O default antigo `${UPLOAD_HOST_DIR:-./uploads}`
apontava para `<repo>/infra/uploads`, não para `<repo>/uploads`. O modo de falha da receita é o
pior tipo: `mv -T uploads` move um diretório vazio (ou falha por inexistência), a contagem fecha em
`0 == 0`, o guia dá o passo por bem-sucedido, e as imagens de verdade ficam em `infra/uploads`,
fora do bind mount novo.

Mas consertar o caminho seria polir código morto. **Nenhum deploy tem esse diretório para
migrar**: não existe produção com dados; o único ambiente de pé é o demo, parado na Fase 9, ainda
sem `uploads/`, e ele é recriado do zero quando a Fase 10 subir — já com `UPLOAD_HOST_DIR` absoluto
e fora da árvore. A receita não terá executor, e o "conferir no servidor" não tem servidor onde
conferir. O que vale preservar é o gotcha, no lugar em que ele previne a próxima ocorrência: quem
escreve `./uploads` num compose de `infra/` acha que está apontando para a raiz, e não está.

**Blocked by:** None. É correção de documento e de comentário, não de código, e a 04 já está mergeada.

**Status:** fechada em 2026-09-16

- [x] A seção "Migrar um deploy que ainda tem `uploads/` dentro do repo" sai do
      `apps/api/docs/guides/deploy.md`. No lugar, uma nota curta: nenhum deploy antecede este layout — o demo
      é recriado do zero (`prod:down` + `prod:up` com `UPLOAD_HOST_DIR` absoluto no
      `.env.production`), então não há nada a migrar. O bloco "criar o diretório antes da primeira
      subida" fica, porque é o que de fato se executa.
- [x] O motivo de `UPLOAD_HOST_DIR` exigir caminho **absoluto** fica registrado onde se lê a
      variável: fonte relativa de bind mount resolve contra o diretório do primeiro `-f` (`infra/`),
      não contra a raiz do repo — é o mesmo motivo de o compose de dev pedir `../uploads`. Uma frase
      no bullet de `UPLOAD_HOST_DIR` do guia e no comentário do mount em
      `infra/docker-compose.prod.yml`, que hoje diz "fora do working tree" sem dizer por que
      relativo não serve.
- [x] `npm run docs:check` verde (a seção removida pode ser alvo de âncora em algum lugar).

## Triagem (2026-09-16)

O que foi verificado antes de decidir, para que a decisão não dependa de memória:

- `docker compose config` sobre o compose pré-10.4 (`b53776a`) rende
  `source: <repo>/infra/uploads` — tanto para o fallback `:-./uploads` quanto para
  `UPLOAD_HOST_DIR=./uploads`, que era o valor sugerido pelo `.env.example` da `main`. Caminho
  relativo vindo de `--env-file` também resolve contra o diretório do projeto.
- Os compose foram para `infra/` em 2026-07-20 (`fbd6547`); o bind mount só nasceu em 2026-09-02
  (`b53776a`). Nunca houve deploy em que o container escrevesse em `<repo>/uploads`: tudo o que a
  API e o seed-em-container gravaram foi em `<repo>/infra/uploads`. Isso explica o `EACCES` do
  seed que a 04 relata (Docker criou `infra/uploads` como root; o container roda como 1000).
- O demo é o único ambiente de pé, está no fecho da Fase 9 e não tem diretório de uploads. Será
  recriado do zero na subida da Fase 10. Não há dado a preservar em lugar nenhum.

Com isso, o terceiro critério original ("conferido no servidor real qual dos dois diretórios tem
os arquivos") caiu: não há o que conferir. Se um dia existir um deploy com `infra/uploads`
populado, a receita antiga está no histórico do git — e a nota nova diz que o caso não existe.

## O que foi feito (2026-09-16)

- `apps/api/docs/guides/deploy.md`: a subseção de migração (35 linhas, com o `mv -T` e a conferência de
  contagem) deu lugar a "Não há deploy para migrar" — quatro linhas: nenhum deploy antecede este
  layout, o demo é recriado do zero (`prod:down` → `UPLOAD_HOST_DIR` absoluto → `prod:up`). O bloco
  `mkdir` + `chown` de antes da primeira subida ficou intacto. O bullet de `UPLOAD_HOST_DIR` ganhou
  o porquê do "absoluto": fonte relativa resolve contra o diretório do primeiro `-f` (`infra/`).
- `infra/docker-compose.prod.yml`: o comentário do mount, que dizia "sem fallback" e "fora do
  working tree", agora diz também **por que absoluto** — com o exemplo concreto de que `./uploads`
  ali era `<repo>/infra/uploads`.
- `apps/api/docs/adr/README.md#infraestrutura`: a seção da 10.4 dizia que a propriedade "banco guarda a chave"
  *tornou a migração um `mv`*, apontando para uma receita que deixou de existir. Reescrito no
  condicional, e um parágrafo novo narra a remoção (10.19) com os dois motivos — a receita estava
  errada, e não tinha executor. Sem `###` novo nem linha no índice: é reversão dentro da mesma
  decisão, narrada no lugar, como a regra de contexto pede.
- Nenhuma âncora apontava para a subseção removida; `docs:check`, `lint` e `typecheck` verdes. O
  compose de prod só mudou em comentário (YAML validado).
- Revisão (padrões + spec): `docs/todo.md` passou a 14/20 com a 19 fechada; o índice
  `apps/api/docs/adr/README.md` ganhou "e absoluta" na linha da 10.4 (o fato novo era acréscimo, não só
  reversão); o parágrafo do `infrastructure.md` caiu pela metade e aponta para o guia em vez de
  repetir a explicação; a nota do guia perdeu o "desta versão", que envelheceria no primeiro
  deploy. A linha `Triagem:` sai mesmo — `docs/agents/triage-labels.md`: "a linha some quando o
  item é concluído".
