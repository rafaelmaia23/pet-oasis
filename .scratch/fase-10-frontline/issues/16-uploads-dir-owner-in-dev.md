# 16: `uploads/` sem dono em dev, num clone novo

**What to build:** o conserto do que a 04 deixou em dev. Ela tirou `uploads/.gitkeep` do git e
passou a ignorar o diretório inteiro — certo em produção, e a justificativa está no comentário do
compose de dev: lá o estágio `dev` da imagem roda como root, então a disputa de dono "não existe".

Existe, só que do outro lado. Num clone novo, `uploads/` **não existe**. Quem chega primeiro é o
`npm run dev`, e o bind mount `../uploads` faz o Docker criar o diretório no host **como root**.
Depois disso, o que roda no host com o usuário do host não consegue escrever ali: `UPLOAD_DIR` é
`./uploads` no `.env.development`, e `npm run db:seed` com `SEED_FAKE_DATA=true` grava imagem —
EACCES, exatamente o segundo dos dois incidentes que a 04 foi escrita para matar.

A suíte não é atingida: `vitest.config.ts` redireciona `UPLOAD_DIR` para um tmpdir.

**Blocked by:** None.

**Status:** needs-triage

**Triagem:** needs-triage — o defeito é certo; qual conserto, não.

- [ ] Um clone novo mais `npm run dev` mais `npm run db:seed` (com `SEED_FAKE_DATA=true`) roda até
      o fim, sem EACCES, sem passo manual não documentado.
- [ ] Seja qual for o caminho — recriar um arquivo versionado sob `uploads/`, criar o diretório
      num passo de setup, ou fixar o uid também no estágio `dev` —, o porquê fica junto do
      comentário do compose de dev, que hoje afirma que a disputa não existe em dev.
- [ ] O comentário do `.gitignore` deixa de dizer só "o storage cria sozinho": quem cria primeiro
      é o Docker, e é isso que decide o dono.
