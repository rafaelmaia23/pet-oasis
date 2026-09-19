# O container de dev escreve como o uid do host, não como root (10.16)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A 10.4 tirou `uploads/.gitkeep` do git e deixou o mount de dev dentro da árvore com a
justificativa de que em dev a disputa de dono não existia: o estágio `dev` roda como root, e root
escreve em qualquer lugar. Faltava o outro lado da mesma disputa. Num clone novo `uploads/` **não
existe**, e quem o cria é o Docker ao montar o bind mount — como `root`, antes de qualquer
processo do container rodar. Daí em diante tudo que o seed dentro do container gravava
(`products/<id>/…`) era de `root`, e o que roda **no host** com o usuário do host — `pnpm run
db:seed` com `SEED_FAKE_DATA=true`, `db:cleanup-uploads`, um `rm -rf uploads` — batia em
`EACCES`. O segundo incidente que a 10.4 foi escrita para matar, reproduzido do outro lado.

Pré-criar o diretório (no script `dev` ou por um arquivo versionado) decidiria só o dono da
raiz: os subdiretórios que o container gravasse depois continuariam de `root`, e o `cleanup` do
host tropeçaria neles. O conserto foi na **causa**: o container de dev passou a escrever como o
uid do host. O script `dev` exporta `HOST_UID`/`HOST_GID` a partir de `id -u`/`id -g` — nenhum
passo de setup. O Compose tem default `1000` só para os scripts que não sobem o `api`
(`dev:down`, `dev:mail`, `dev:db`) não avisarem variável vazia; não é cobertura para quem invoca
o Compose por fora do pnpm com outro uid — esse recebe uma árvore de `1000` e o EACCES volta, e a
lição da 10.4 sobre fallback que reintroduz o bug vale aqui também. O
[entrypoint de dev](../../infra/docker-entrypoint.dev.sh) roda em **duas passadas**: ainda como
root, gera o client Prisma no volume anônimo `src/generated` (que é de root e não tem por que
deixar de ser) e entrega `/app/uploads` ao uid do host com um `chown -R` — recursivo de
propósito, para curar no `up` seguinte a árvore que um clone anterior a esta decisão já tenha
deixado como `root`; depois se re-executa via `setpriv` (util-linux, já na imagem base — nenhum
pacote novo) com o uid do host, e é essa segunda passada que roda `migrate`, o seed e o `tsx
watch`. `HOME` vai para `/tmp` porque o uid do host não tem entrada no `/etc/passwd` do container
e o CLI do Prisma escreve o cache de checkpoint sob `$HOME`. Se o próprio host roda como root
(`HOST_UID=0`), não há para onde cair e a queda é pulada — sem a guarda, a segunda passada
seria root de novo e regeneraria o client para sempre. O `Dockerfile` continua sem `USER
node` no estágio `dev`, mas o comentário lá deixou de dizer "fica root": fica root **para o
`generate`**, e só até ali.

A assimetria com produção é deliberada: lá o uid é **fixado** em `1000` (10.4) porque o servidor é
um só e o `chown` do guia de deploy precisa concordar com um número escrito; em dev o uid é o de
**quem clonou**, porque cada máquina tem o seu, e escrever um número faria o conserto valer só
para quem por acaso for `1000`.
