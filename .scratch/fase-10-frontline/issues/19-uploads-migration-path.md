# 19: A receita de migração do `uploads/` aponta para o diretório errado

**What to build:** o conserto da receita que a 04 escreveu no guia de deploy. Ela manda, a partir
do repo clonado:

```bash
sudo mv -T uploads /srv/pet-oasis-data/uploads
find /srv/pet-oasis-data/uploads -type f | wc -l   # tem de bater com a de antes
```

O caminho está errado. O Compose resolve fonte relativa de bind mount contra o **diretório do
projeto**, que aqui é `infra/` (é o diretório do primeiro `-f`). O default antigo
`${UPLOAD_HOST_DIR:-./uploads}` apontava para `<repo>/infra/uploads`, não para `<repo>/uploads`.
Confirmado com `docker compose config`: o compose de dev pede `../uploads` justamente por isso, e
ele rende o `uploads/` da raiz.

O modo de falha é o pior tipo: o `mv -T uploads` da receita move um diretório vazio (ou falha por
inexistência), a contagem de arquivos fecha em `0 == 0`, o guia dá o passo por bem-sucedido, e as
imagens de verdade continuam em `infra/uploads` — fora do bind mount novo, logo fora do ar.

**Blocked by:** None. É correção de documento, não de código, e a 04 já está mergeada.

**Status:** needs-triage

**Triagem:** needs-triage — o defeito é certo; convém conferir no servidor onde os arquivos estão
de fato antes de escrever o caminho novo na receita.

- [ ] A receita nomeia o caminho de origem correto, e diz **por que** ele é aquele (o diretório do
      projeto é `infra/`, e é isso que faz caminho relativo em compose não significar "a raiz do
      repo").
- [ ] A verificação deixa de poder passar por vacuidade: contar arquivos na origem **antes** do
      `mv`, e recusar seguir se a contagem for zero.
- [ ] Conferido no servidor real qual dos dois diretórios tem os arquivos, antes de o guia afirmar
      um deles.
