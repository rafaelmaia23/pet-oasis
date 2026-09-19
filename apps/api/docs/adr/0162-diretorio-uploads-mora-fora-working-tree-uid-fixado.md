# O diretório de uploads mora fora do working tree, e o uid é fixado no serviço (10.4)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Imagem e boot de produção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A 9.10 escolheu bind mount e o pôs em `./uploads`, **dentro do repo clonado**, com um
`uploads/.gitkeep` versionado para garantir que o diretório existisse antes do primeiro `up`. O
raciocínio de então estava certo na metade que enxergava (bind mount criado pelo Docker nasce de
`root`, e o container não-root não escreveria nele) e errado na que faltava: versionar o
diretório põe o **git como dono de um caminho que o container escreve**. No servidor, o git roda
como o usuário do host (uid 1001) e o container como `node` (uid 1000) — não existe dono que
satisfaça os dois. O preço foi um `pull` abortado por `Permission denied` em `uploads/.gitkeep`,
deixando o checkout pela metade, e um `EACCES` no seed. Fora da árvore, os dois donos deixam de
disputar o mesmo caminho, e o dado enviado também deixa de estar ao alcance de uma limpeza de
arquivos não rastreados no repo.

Então `uploads/` saiu do git por inteiro (o `.gitkeep` foi removido, o `.gitignore` ignora o
diretório) e `UPLOAD_HOST_DIR` virou **obrigatória** em produção: o `:-./uploads` que ela tinha
era o caminho silencioso de volta para dentro da árvore, e um fallback que reintroduz o bug que
se acabou de corrigir não é conveniência. Faltando a variável, o `prod:up` falha nomeando-a — a
mesma política da rede `proxy` declarada como `external:`. O mount de dev continua em
`../uploads`, sem variável nova para quem clona. Esta decisão acreditou que em dev "nada disso
morde", porque o estágio `dev` rodava como root e o git não é mais dono de nada ali; a 10.16
mostrou que o **host** era o outro dono em disputa, e resolveu a parte de dev (seção abaixo).

O uid ficou **fixado no serviço** (`user: "1000:1000"`) em vez de herdado do `USER node` da
imagem base. Herdar amarra a permissão do diretório do host a uma escolha da base: um bump que
mudasse o uid de `node` viraria EACCES no primeiro upload, e o sintoma — 500 ao enviar imagem —
não aponta para a causa. Fixado, o número está escrito nos dois lugares que precisam concordar
(o compose e o `chown` do [guia de deploy](../guides/deploy.md)), e eles mudam juntos ou nenhum.

Nada gravado no banco mudou, e essa é a propriedade que faria de uma migração um simples `mv`: o
banco guarda a **chave** do arquivo, nunca a URL — que nasce de `UPLOAD_PUBLIC_BASE_URL` a cada
resposta.

A receita de migração que a 10.4 escreveu no guia de deploy foi **removida** na 10.19. Ela
mandava mover `<repo>/uploads`, mas o `:-./uploads` antigo nunca gravou ali: fonte relativa de bind
mount resolve contra o diretório do projeto do Compose — `infra/`, o do primeiro `-f` —, e o `mv`
moveria um diretório vazio com a conferência de contagem fechando em `0 == 0`. Corrigir não valia:
nenhum deploy carrega dados, e o demo é recriado do zero. O que ficou é o fato que a derrubou,
no [guia de deploy](../guides/deploy.md) (bullet de `UPLOAD_HOST_DIR`) e no comentário do mount —
para que "absoluto" deixe de parecer preciosismo.

**O que o primeiro deploy com este layout ensinou (10.21).** A 10.19 estava certa em que não
havia diretório a migrar — e errada em supor que por isso não havia nada a fazer. O `prod:up`
da Fase 10 trocou o container mas **preservou o volume do banco**, e o banco da Fase 9 tinha as
linhas de imagem do seed; os bytes delas viviam **dentro do container antigo** (a Fase 9 não
tinha bind mount) e morreram com ele. O seed do boot é idempotente — não regrava o que o banco
já tem —, então subiu limpo (`SEEDING COMPLETED!`) com a vitrine respondendo **404 em toda
imagem**: linha sem byte é o único estado que nem o seed nem o healthcheck enxergam. Regra
geral: **toda troca de onde os bytes moram exige regravá-los ou movê-los; o banco não avisa.**
Numa demo, o conserto é o `demo-reset` (trunca e repovoa, gravando no mount novo); num deploy
com dados seria um `mv` — e é para esse dia que a propriedade "o banco guarda a chave" continua
valendo. Ficou também o detalhe do `chown`: o par que importa é o **número** `1000:1000`, o do
`user:` do serviço, não o nome de usuário do host que por acaso o carrega (`opc` no servidor
atual, `node` na imagem) — nomes divergem entre máquinas, o uid é o contrato.
