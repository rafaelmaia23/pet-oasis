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

**Status:** fechada em 2026-09-16

**Decisão:** conserto escolhido: **o container de dev grava como o uid do
host**, não como root. Dos três caminhos abaixo, pré-criar o diretório (no script ou por um
arquivo versionado) só decide o dono da raiz de `uploads/`: tudo que o seed dentro do container
gravasse depois (`products/<id>/…`) continuaria de `root`, e `db:cleanup-uploads` no host, ou um
`rm -rf uploads`, tropeçaria no mesmo EACCES por outra porta. Fixar o uid mata a classe, não o
sintoma. Forma: o script `dev` exporta `HOST_UID`/`HOST_GID` (`id -u`/`id -g`, sem passo de
setup); o entrypoint de dev faz o `prisma generate` ainda como root (é o que escreve no volume
anônimo `src/generated`) e cai para o uid do host, via `setpriv` (já na imagem base), antes de
`migrate`, `seed` e `tsx watch` — os passos que tocam o bind mount.

- [x] Um clone novo mais `npm run dev` mais `npm run db:seed` (com `SEED_FAKE_DATA=true`) roda até
      o fim, sem EACCES, sem passo manual não documentado.
- [x] Seja qual for o caminho — recriar um arquivo versionado sob `uploads/`, criar o diretório
      num passo de setup, ou fixar o uid também no estágio `dev` —, o porquê fica junto do
      comentário do compose de dev, que hoje afirma que a disputa não existe em dev.
- [x] O comentário do `.gitignore` deixa de dizer só "o storage cria sozinho": quem cria primeiro
      é o Docker, e é isso que decide o dono.

## O que foi feito

- **Reproduzido antes de consertar**, num worktree sem `uploads/`: o `up` criou o diretório como
  `root:root`, o seed do container deixou `brands/`, `pets/`, `products/<id>/*.webp` todos de
  `root`, e `touch`/`mkdir` pelo host deram `Permissão negada`.
- `infra/docker-entrypoint.dev.sh` roda em **duas passadas**: como root, `prisma generate` (volume
  anônimo) e `chown -R HOST_UID:HOST_GID /app/uploads`; depois `exec setpriv --reuid --regid
  --clear-groups env HOME=/tmp "$0"` e a segunda passada faz `migrate`, seed e `tsx watch`.
  `setpriv` já vem no `node:22-bookworm-slim` (util-linux) — nenhum pacote novo na imagem.
- `infra/docker-compose.dev.yml` recebe `HOST_UID`/`HOST_GID` (default `1000`); o script `dev` do
  `package.json` exporta os dois de `id -u`/`id -g`. Nenhum passo de setup para quem clona.
- **Verificado depois**, no mesmo worktree: `uploads/` e cada arquivo nascem `rfonseca:rfonseca`,
  PID 1 do container roda como `1000:1000` com `HOME=/tmp`, a API responde, o host cria e apaga
  dentro de `uploads/products/`. Uma subárvore plantada como `root` foi curada por um `restart`
  do serviço — é o que o `chown -R` compra para quem já tinha um clone com o defeito.
- Comentários corrigidos onde a issue pediu: compose de dev (a disputa existe, e é com o host),
  `.gitignore` (quem cria primeiro é o Docker), estágio `dev` do `Dockerfile` (root só até o
  `generate`). O porquê permanente está em `docs/context/infrastructure.md` § "O container de dev
  escreve como o uid do host, não como root (10.16)", com a linha no índice e o parágrafo da 10.4
  reescrito narrando o que ela não enxergou; o ADR `environments-and-deploy.md` deixou de dizer
  "fica root para evitar EACCES".
- A suíte não muda: `vitest.config.ts` continua apontando `UPLOAD_DIR` para um tmpdir, e o
  caminho consertado (Compose + entrypoint) não tem seam testável em Vitest — a prova é a
  reprodução acima.
