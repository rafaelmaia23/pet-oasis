# Infraestrutura — ambientes, deploy, documentação da API e seeds

> Nenhuma regra de negócio vive aqui: é empacotamento, ambiente e dado de demonstração. O ADR
> [`environments-and-deploy.md`](../adr/environments-and-deploy.md) detalha a estrutura de
> Compose; o procedimento operacional está em [`guides/deploy.md`](../guides/deploy.md).

---

## Ambientes

### Os dois bugs que motivaram a reformulação (Fase 6)

1. O app **nunca falava com a Resend** — o compose único hardcodava `SMTP_HOST: mailpit` /
   `SMTP_PORT: 1025` no serviço `app` e não repassava `SMTP_USER`/`SMTP_PASS`.
2. Um bring-up de "produção" subia `db_test` e `mailpit` (sem profile, sempre ligados).

### Compose base + overrides

Um `docker-compose.yml` base (só o esqueleto do `api`) + `docker-compose.{dev,prod,test}.yml`.
Mailpit e Postgres-de-dev existem só no override de dev; **prod sobe só `api` + Postgres-de-prod**;
test sobe só Postgres-de-test (mailpit-de-test atrás de `--profile mail`, inerte porque os testes
mockam `@/lib/email`). Isolamento por **nome de projeto** (`-p pet-oasis-{dev,test,prod}`) +
`container_name`/volumes/portas distintos → dev e test rodam juntos. O SMTP do app passa a vir
inteiro do `env_file` (mata o bug 1); prod não instancia infra de dev/test (mata o bug 2). O
app-em-dev também passou a rodar **em container** (via `tsx watch` lendo `src/` por bind-mount),
não mais no host.

Isso **superou o desenho anterior** (Fase 5), em que o serviço (então chamado `app`) ficava
atrás de um profile `full` e derivava a própria `DATABASE_URL` (`@db:5432`) porque o app rodava
no host: o profile existia para que `docker compose up -d` não subisse um app-em-container
brigando pela porta, e a `DATABASE_URL` própria existia porque o app-em-container alcança o
Postgres pelo **nome do serviço**, não por `localhost`. Com um override por ambiente, os dois artifícios deixaram de ser
necessários.

### O serviço do Compose se chama `api`, com alias de rede explícito (10.1)

O nome do serviço **é** o endereço: o Compose o publica no DNS da rede, então é o que um cliente
interno escreve no código. Enquanto o serviço se chamou `app`, o DNS publicava `app` — e o front
(`pet-oasis-web`), cujo ADR já dizia `http://api:3000`, teria falhado em resolução de DNS no
primeiro deploy conjunto. Renomear o serviço para `api` (container de produção `pet-oasis-api`,
o de dev `pet-oasis-dev-api`) é o que torna verdadeiro um contrato já publicado do outro lado.

Um **alias de rede explícito** é declarado no compose base, apesar de o Compose já criar um
implícito com o nome do serviço. O motivo é o modo de falha: DNS que some numa renomeação não
grita — o cliente vê `ENOTFOUND` e a causa fica a três camadas de distância. Declarado, o
endereço `api` sobrevive a um rename futuro do serviço.

O que **não** foi renomeado, de propósito: o `WORKDIR /app` e os caminhos montados dentro do
container (são sistema de arquivos, não serviço — renomear quebra os bind mounts) e `APP_URL`
(é a URL pública do **cliente**, e sempre quis dizer isso). Só a variável da porta publicada no
host acompanhou o serviço: `APP_PORT` → `API_PORT`.

Renomear um serviço **órfã o container antigo**: ele continua rodando, com o rótulo do projeto
compose mas sem serviço correspondente na config, e o `down` não o leva junto — o próximo `up`
falha por porta já alocada, e o diagnóstico ("port is already allocated") não aponta para a
renomeação. Por isso `dev`, `dev:down`, `dev:reset`, `prod:up` e `prod:down` passaram a levar
`--remove-orphans`: a limpeza vira parte do ciclo normal, e a próxima renomeação não repete o
episódio.

O nome do container de produção está **gravado nos três systemd units** de `infra/cron/`
(`docker exec pet-oasis-api …`), que por isso precisam ser reinstalados **antes** do deploy que
renomeia — procedimento e verificação manual em [`infra/cron/README.md`](../../infra/cron/README.md).
Unit apontando para container inexistente falha de um jeito que não acorda ninguém.

### Três redes com papéis distintos, e a porta da API despublicada (10.2, revisto na 10.17)

Produção declara **três** redes, e a API é o único serviço nas três — é ela que atravessa a
fronteira entre os dados e quem os pede:

| Rede | Quem entra | Para quê |
|---|---|---|
| `backend` (`internal: true`) | `db`, `redis`, `api` | onde os dados vivem, sem rota para a internet |
| `pet-oasis` (`external: true`, `name:` explícito) | `api` + clientes internos | o endereço que um cliente no mesmo VPS usa |
| `proxy` (`external: true`) | `api` + nginx + clientes internos que o nginx serve | por onde o público entra |

O `internal: true` é o que faz um cliente na rede compartilhada **não** alcançar Postgres nem
Redis: estar na `pet-oasis` dá acesso à API, e só. A API mantém saída para a internet (SMTP) pelas
outras duas, que não são internas. O `name: pet-oasis` é **contrato**: é o que o compose do
cliente escreve como `external: true`, e é esse nome que o `up` dele procura.

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
[`security.md`](security.md). `API_PORT` sobrevive **só em dev**, onde publicar é como o navegador
e o Bruno alcançam a API na máquina de quem desenvolve.

Dev não herda a topologia, de propósito: lá `db` e `redis` publicam porta para o tooling do host
(prisma, vitest), o que é o oposto de `internal: true`. E a rede do proxy não pode ser declarada no
compose **base** porque `external: true` exige que ela exista — declará-la ali quebraria o
`npm run dev` de quem nunca subiu um nginx.

### Envs por arquivo + dotenv-cli

`.env.development`/`.env.test`/`.env.production` (fora do git) + `.env.example` versionado — colapsa
cinco fontes numa por ambiente. Containers recebem via `env_file:`. No host, o `vitest.config.ts`
carrega `.env.test` (`override: true`), então `npx vitest run <arquivo>` funciona sozinho, e a
autoria de migration usa `dotenv-cli` (`dotenv -e .env.development -- prisma …`). A URL do banco de
teste, antes duplicada em quatro lugares, vive só no `.env.test`. `src/config/env.ts` e
`prisma.config.ts` ficam intocados (o `import "dotenv/config"` vira no-op sem `.env` na raiz).

### Graceful shutdown nativo do Compose, não script com `spawn`

Healthchecks + `depends_on: service_healthy` + `--wait` (prod/test); dev em **foreground**
(incompatível com `--wait`), Ctrl+C → SIGTERM gracioso. O app trata SIGTERM/SIGINT via
`createShutdownHandler` (`src/lib/shutdown.ts`, injeção de dependência → testável):
`server.close()` (drena in-flight) → `prisma.$disconnect()` → exit, com timeout de força-saída (10s
< `stop_grace_period` de 15s do prod). O entrypoint faz `exec` do Node/tsx para ele ser **PID 1** e
receber o sinal.

### O client Prisma do dev num volume anônimo

O generator escreve em `src/generated`, que o bind-mount de `./src` mascararia; um volume anônimo em
`/app/src/generated` preserva o client gerado no container (o entrypoint de dev roda `prisma
generate` no start). Evita churn nos imports `@/generated`. O stage `dev` do Dockerfile para no `npm
ci` completo (sem bundle/prune) e fica root, evitando EACCES de uid no bind-mount; o `runtime` de
prod segue intocado.

---

## Imagem e boot de produção

### `migrate deploy`, nunca `migrate dev`

`migrate dev` é interativo, pode gerar/aplicar migrations novas e **resetar o banco** em caso de
drift — inaceitável num servidor. `migrate deploy` só aplica as migrations já versionadas, de forma
idempotente e não-interativa. O entrypoint faz `migrate deploy → seed → start`: a subida deixa um
ambiente do zero funcionando. O seed é idempotente (upserts), então rodar a cada start é seguro.

### O boot para no dado de referência e segue no de demonstração (10.3)

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

### O seed é bundlado pelo tsup (`dist/seed.js`)

`prisma db seed` invoca `tsx prisma/seed.ts`, que importa de `src/` — nada disso existe na imagem de
produção (só `dist/` + node_modules de prod, sem `tsx` nem código-fonte). Adicionar `prisma/seed.ts`
como 2ª entry do tsup produz um `dist/seed.js` auto-contido (o client Prisma gerado é embutido no
bundle; o wasm do query-compiler vem de `@prisma/client` em runtime), que o entrypoint roda com
`node dist/seed.js`. O fluxo de dev segue usando `prisma db seed` (tsx) inalterado.

### Imagem multi-stage e não-root

O build (deps completas, `prisma generate`, `tsup`) é pesado e não precisa ir para produção: um
stage `deps` isola as dependências de produção, o stage `build` gera o `dist/`, e o `runtime` copia
só `node_modules` de prod + `dist/` + schema/migrations (para o `migrate deploy`). Roda como `USER
node` — higiene básica de container.

---

### O OpenSSL vai nos três estágios da imagem, e a engine do Prisma é detectada (10.5)

`node:22-bookworm-slim` não traz o binário `openssl` nem o libssl — o Node linka o seu
estaticamente. Sem eles a detecção de libssl do Prisma falha, e o default silencioso é o
schema-engine `debian-openssl-1.1.x`. Rodava, porque a engine só é exercida no `migrate deploy` do
entrypoint, mas o log de inicialização abria com dois blocos de warning e a engine era a errada
escolhida por acidente — acidente que muda de resultado em ARM64 ou num bump da imagem base.

O `openssl` é instalado nos **três** estágios, porque a escolha acontece duas vezes em cada
imagem: no `npm ci`, onde o `@prisma/engines` decide qual build do schema-engine baixar, e no boot,
onde o CLI redetecta. Instalar só no runtime faria os dois discordarem — a detecção pediria 3.0.x e
a imagem carregaria o binário 1.1.x, que é o caso pior dos dois. O estágio `dev` entrou logo
depois, pelo mesmo motivo pelo outro caminho: o `docker-entrypoint.dev.sh` roda `prisma generate` e
`migrate deploy`, então todo `npm run dev` também abria com os dois blocos de warning. Lá o custo é
**negativo** — a engine 3.0.x é menor que a 1.1.x o bastante para pagar a camada do apt e sobrar
(1368,56 MB → 1365,90 MB).

**Detectar, e não pinar** com `PRISMA_CLI_BINARY_TARGETS`: o alvo carrega a arquitetura junto da
versão do SSL (`debian-openssl-3.0.x` contra `linux-arm64-openssl-3.0.x`), então fixá-lo calaria o
warning e congelaria justamente a fragilidade em ARM64 que motivou o item. Custo medido: +7,34 MB
da camada do apt, −5 MB da engine menor que a anterior, +2,34 MB líquidos numa imagem de ~942 MB.

---

### Não existe script para apagar o banco de produção (10.5)

Provar que o boot está limpo exige um banco **vazio**: com o banco já migrado, o `migrate deploy`
só lê a tabela de migrations e responde "nada pendente", sem exercitar a engine. O caminho é
apagar o volume com `docker compose ... down -v`, e a simetria com o `dev:reset` sugeriria um
`prod:reset` no `package.json`.

Ele não existe, e é decisão: **apagar produção é ato deliberado, digitado à mão**. Um script de
nome amigável encostado no `prod:up` na mesma lista transforma perda total de dados em erro de
digitação. O atrito de escrever o comando inteiro — com `-p`, `--env-file` e os dois `-f` — é
proteção barata, e a operação acontece uma vez por issue de infra, não todo dia. O comando está
escrito no roteiro de verificação da issue que precisou dele, não no `package.json`.

---

### A API atende num subdomínio, e o apex fica limpo (10.6)

O endereço público da API é **`pet-oasis-api.maiahub.com.br`**. O apex fica para o front: numa
demo de portfólio a vitrine chama mais atenção que uma UI de documentação, e a API não perde
nada indo para um subdomínio. Sair do apex e entregá-lo ao front são **dois passos separados**,
e é de propósito — o segundo depende do front, o primeiro não (ver a ordem, no fim desta seção).

**O nome é de primeiro nível, e isso foi uma correção.** A primeira versão desta decisão
(2026-09-06) escolheu `api.pet-oasis.maiahub.com.br`, um nome de segundo nível sob o domínio.
O operador configurou DNS, certificado e proxy host para ele, e a verificação de fora
(2026-09-16) achou o handshake TLS falhando (`alert handshake failure`) antes de qualquer
requisição chegar ao servidor. A causa é da borda, não do servidor: os registros deste domínio
são **proxiados pela Cloudflare**, e o Universal SSL dela cobre só o apex e `*.maiahub.com.br` —
um segundo nível não tem certificado na borda. As saídas eram três: registro em *DNS only* (perde
o proxy da Cloudflare só nesse host), Advanced Certificate Manager (pago) ou trocar o nome. Trocar
o nome custou retrabalho de apontadores e foi o escolhido — o nome é o que menos importa nas
três, e é o único que não deixa exceção ou custo recorrente para trás.

**Os 301 no apex foram planejados e descartados.** A primeira versão prometia que o apex
manteria `301` em `/reference` e `/openapi.json` — os dois caminhos que o README e a coleção já
tinham divulgado —, para que link publicado não morresse na virada. Caiu na mesma revisão de
2026-09-16: a demo era quase não divulgada, então o link a preservar praticamente não existia, e
o custo era manter dois `location` **para sempre** num host que não é da API — resíduo que o
front herdaria sem saber por quê. O apex vai direto para o front; quem tinha o link antigo troca
a base. `/api/v1/*` nunca foi redirecionado: quem chama a API troca a base, e os nossos dois
apontadores (README e a coleção Bruno) apontam para o subdomínio.

**A cadeia de IP ganhou um salto, e ele é tratado no proxy.** A decisão da 10.2 descrevia duas
cadeias, `visitante → nginx → api` e `visitante → nginx → front → api`, e o `trust proxy` por
endereço privado ([`security.md`](security.md) § "`trust proxy` é por endereço de origem") acerta
as duas. Com o proxy da Cloudflare ligado, quem abre a conexão no reverse proxy é a **borda da
Cloudflare**, e o salto a mais quebraria a decisão: o proxy anexaria o próprio `$remote_addr` ao
`X-Forwarded-For`, a API receberia `visitante, ip-da-cloudflare`, e a caminhada da direita para a
esquerda pararia no IP da Cloudflare — que não é privado — com todos os visitantes num balde só,
o problema exato que a 10.2 resolveu. A correção mora no **proxy host**, não na API:
`real_ip_header CF-Connecting-IP; real_ip_recursive off;`. O Nginx Proxy Manager já confia nas
faixas da Cloudflare (`set_real_ip_from`, em `ip_ranges.conf`, baixado no boot), então
`$remote_addr` vira o visitante, a API recebe `visitante, visitante` e pega o visitante.
`recursive off` porque `CF-Connecting-IP` carrega um endereço, não uma lista. Vale para todo
proxy host que receba visitante pela Cloudflare — o da API e, quando o front subir, o do apex
(`visitante → Cloudflare → NPM → front → api`). A API não muda: o contrato dela continua sendo
"o primeiro endereço não-privado da direita para a esquerda", e é o proxy que garante que esse
endereço é o do visitante.

Duas coisas que a migração **não** custou, e as duas são dividendo de decisão antiga:

- **Nenhuma migration para as imagens.** O banco guarda a **chave** do arquivo e nunca a URL
  ([ADR de upload](../adr/file-storage-and-uploads.md)), então trocar o host é trocar
  `UPLOAD_PUBLIC_BASE_URL` e mais nada — foi o que fez a troca de nome custar uma variável.
  A base pública das imagens segue a API, não o front: quem serve o byte é o `express.static`
  do Node, atrás do certificado do subdomínio.
- **Nenhuma mudança na especificação.** `servers: [{ url: "/api/v1" }]` em
  [`src/docs/openapi.ts`](../../src/docs/openapi.ts) é **relativo**, então o documento segue o
  host que o serviu. Um `servers` absoluto teria feito o Scalar do subdomínio disparar "try it"
  contra o host velho.

**A ordem é parte da decisão.** Subdomínio e certificado vêm primeiro; `APP_URL` — que sempre
quis dizer *o app que a pessoa vê*, e passa a apontar para o front — só vira depois de o front
ter no ar as quatro rotas de email (verificação, redefinição de senha, confirmação de troca de
email, confirmação de reativação). Virar antes transforma verificação de conta e reset de senha
em 404, que são justamente os fluxos que destravam conta nova, e a falha é silenciosa em todo
lugar menos na caixa de entrada de quem se cadastrou.

**A ordem foi relaxada na execução (10.14), e por decisão, não por descuido.** O dono do projeto
virou `APP_URL` para o apex **antes** de o front ter as rotas no ar, com dois argumentos: o
único ambiente de pé é uma demo efêmera, sem conta real, então o link 404 num email de
demonstração não custa nada; e manter a issue aberta amarrava o fecho da fase ao calendário de
outro repositório. A regra acima continua sendo a regra para um deploy com usuários — o que
mudou foi o julgamento de que a demo não é um. A 10.14 fechou do lado do backend: subir o front
no apex, apontar o proxy host do apex para o container dele e provar os quatro fluxos ponta a
ponta é trabalho do `pet-oasis-web`, e esta pasta de issues guarda só o que é da API.

A configuração do reverse proxy (Nginx Proxy Manager, certificado por desafio DNS na
Cloudflare) continua **fora deste repositório** (mesmo motivo da seção seguinte); a forma que o
proxy host precisa ter e a verificação estão em [`deploy.md`](../guides/deploy.md).

### O reverse proxy do upload existe, mas não neste repositório (9.10)

`GET /uploads/*` é servido pelo **próprio Node** (`express.static`, em `src/app.ts`), e não pelo
reverse proxy que o [ADR de upload](../adr/file-storage-and-uploads.md) pressupunha. O motivo é
factual: não há proxy nenhum versionado aqui. O nginx existe no servidor pessoal que hospeda a
demo de portfólio, e a configuração dele vive fora do git — este repositório só **declara** a rede
por onde ele alcança a API (10.2, acima).

Servir por Node é o que mantém **um caminho só** nos três ambientes. A alternativa — Node em dev,
nginx em produção — fabricaria a classe de bug "funciona na minha máquina, 404 no deploy", num
ponto em que o sintoma (imagem quebrada) não aponta para a causa.

O que mantém a porta aberta é o volume ser **bind mount** e não volume nomeado: o arquivo fica
visível no filesystem do host, e o dia em que o tráfego justificar, a mudança inteira é um
`location /uploads/ { alias ...; }` no nginx mais um `UPLOAD_PUBLIC_BASE_URL` novo. Nada gravado
no banco muda — ele guarda a **chave**, nunca a URL. De brinde, backup de imagem vira `rsync` de
um diretório em vez de arqueologia em `/var/lib/docker/volumes`.

### O diretório de uploads mora fora do working tree, e o uid é fixado no serviço (10.4)

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

### O container de dev escreve como o uid do host, não como root (10.16)

A 10.4 tirou `uploads/.gitkeep` do git e deixou o mount de dev dentro da árvore com a
justificativa de que em dev a disputa de dono não existia: o estágio `dev` roda como root, e root
escreve em qualquer lugar. Faltava o outro lado da mesma disputa. Num clone novo `uploads/` **não
existe**, e quem o cria é o Docker ao montar o bind mount — como `root`, antes de qualquer
processo do container rodar. Daí em diante tudo que o seed dentro do container gravava
(`products/<id>/…`) era de `root`, e o que roda **no host** com o usuário do host — `npm run
db:seed` com `SEED_FAKE_DATA=true`, `db:cleanup-uploads`, um `rm -rf uploads` — batia em
`EACCES`. O segundo incidente que a 10.4 foi escrita para matar, reproduzido do outro lado.

Pré-criar o diretório (no script `dev` ou por um arquivo versionado) decidiria só o dono da
raiz: os subdiretórios que o container gravasse depois continuariam de `root`, e o `cleanup` do
host tropeçaria neles. O conserto foi na **causa**: o container de dev passou a escrever como o
uid do host. O script `dev` exporta `HOST_UID`/`HOST_GID` a partir de `id -u`/`id -g` — nenhum
passo de setup. O Compose tem default `1000` só para os scripts que não sobem o `api`
(`dev:down`, `dev:mail`, `dev:db`) não avisarem variável vazia; não é cobertura para quem invoca
o Compose por fora do npm com outro uid — esse recebe uma árvore de `1000` e o EACCES volta, e a
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

### `sharp` no ARM64 exige build no próprio servidor (9.10)

O `Dockerfile` é `node:22-bookworm-slim` (glibc, não Alpine), então o `npm ci` baixa o prebuild
`@img/sharp-linux-arm64` — nada compila, nenhum pacote de sistema entra na imagem.

A condição é que a imagem seja **construída no ARM**, que é o que o `prod:up` faz (o Compose tem
`build:`, e o build roda no host). Construir num x86 e enviar a imagem pronta quebra em runtime
com `could not load the sharp module` — erro que não se parece nada com a causa, e que só
apareceria no primeiro upload depois do deploy.

## Documentação da API

### Gerada dos próprios schemas Zod, não escrita à mão

O contrato já vive nos `*.schema.ts` (request) e `*.presenter.ts` (response). Escrever um OpenAPI
paralelo à mão criaria duas fontes que divergem no primeiro refactor. Com o
`.meta({ description, example })` **nativo do Zod 4** (sem monkey-patch, sem `zod-to-openapi`
patchando o protótipo), cada schema carrega a própria doc e o `createDocument` (`zod-openapi`) monta
o `/openapi.json`. O envelope `{ body, params, query }` que os controllers já usam é extraído por
`.shape.*` num helper (`fromEnvelope`), com guarda de presença.

### Os presenters garantem que a doc não vaza segredo

As views já derrubam campos não listados via `.parse()` (`passwordHash`, `tokenHash`,
`refreshTokenHash` nunca entram na resposta). Como os exemplos de response no OpenAPI saem **das
mesmas views**, o documento herda a garantia — verificado por teste (`openapi.test.ts`: a spec não
contém nenhum desses campos). Documentar a partir da whitelist é mais seguro que anotar exemplos à
mão, que poderiam reintroduzir um campo sensível por descuido.

### `/openapi.json` e `/reference` são públicas, no router de topo

Documentação de API é para ser lida sem credencial; travá-la atrás de `authenticate` só atrapalharia.
Ficam no router de topo, antes dos grupos protegidos, fora de `/api/v1`. A UI Scalar consome o
`/openapi.json` e tem "try it" com Bearer preenchível — daí o `securitySchemes.bearerAuth` global no
documento, com as operações públicas sobrescrevendo `security: []`. O hardening da CSP dessa página
está em [security.md](security.md#auto-hospedar-o-bundle-do-scalar-em-vez-de-allowlistar-o-cdn).

### O token da coleção Bruno usa `bru.setVar`, não `setEnvVar`

O `script:post-response` do request `Login` encadeia o access token nas demais requests.
`setEnvVar` grava no arquivo do environment, que é **versionado** — o token do usuário demo acabaria
commitado em `api-collection/`. `bru.setVar` guarda em memória, só durante a execução (também o
caminho preferido no Bruno v4, que está descontinuando `setEnvVar` para esse uso).

---

## Seeds e ambiente demo

### Role `demo` sempre semeada, usuário demo atrás de flag

O objetivo é deixar qualquer visitante exercitar o RBAC ao vivo (todo `GET` → 200, toda escrita →
403) sem sujar ou quebrar dados. A role `demo` (`appliesTo EMPLOYEE`, só features de leitura) faz
parte do catálogo e é sempre semeada. Já o **usuário** só nasce com `SEED_DEMO_USER=true` (ligado no
Docker/prod, desligado em dev/test para não sujar a suíte). Assim o mesmo seed serve os três
ambientes sem ramificar além desse flag. As credenciais são públicas de propósito
(`env.DEMO_EMAIL`/`DEMO_PASSWORD`), e o seed limpa `bannedAt`/`bannedBy`/`banReason` no update — um
redeploy sempre restaura o demo utilizável.

### Reset do demo é truncate+reseed, e a guarda é flag explícita

"Deletar o que não é seed" exigiria um marcador em toda tabela e cresceria a cada model novo da Fase
9; truncate+reseed é determinístico e não cresce. A guarda é `DEMO_MODE=true` — **não** `NODE_ENV`,
porque o deploy demo *é* production, e inferir apagaria o banco de produção de verdade caso o projeto
ganhe um. Sem a flag: erro barulhento, exit ≠ 0, nada apagado. O reset é **diário** (não a cada 3
dias) para ninguém encontrar a bagunça do visitante anterior, com o horário publicado na doc — o que
transforma um logout inesperado em comportamento documentado.

O reset é **higiene**, não o que garante o demo read-only — isso é RBAC (role `demo`). São duas
defesas independentes.

### Gotcha do reseed compartilhado (7.14)

O seed foi extraído para `src/lib/seedDatabase.ts` (`runSeed`, **sem nenhum código auto-executável
no nível do módulo**) e é reusado por `prisma/seed.ts` (CLI) e por `demo-reset.ts`. A primeira
tentativa importava `runSeed` direto de `prisma/seed.ts`, que tinha um `main()` guardado por
`import.meta.url === argv[1]`: o guard funciona em dev, mas o tsup bundla os dois scripts num módulo
só, então **ambos os guards passaram a comparar contra o mesmo** `import.meta.url`/`argv[1]` e
disparavam juntos — rodar `demo-reset.js` executava (e desconectava) o `main()` do seed por baixo. A
lição vale para qualquer script novo: código reaproveitado entre entrypoints não pode carregar
auto-execução.

### A limpeza de upload é por prefixo de dono, nunca a raiz (9.11)

O `demo-reset` passou a limpar o `UPLOAD_DIR`, e a versão óbvia quebraria só onde importa:
`storage.deleteDirectory("")` resolve para o próprio root — o guard de `resolveInsideRoot` permite
`resolved === this.root` — e o `fs.rm` recursivo tentaria remover o **ponto de montagem do bind
mount** (`/app/uploads`). Em dev, sem mount, ele apaga e o `put` recria; em produção falha com
`EBUSY`.

A limpeza itera `Object.keys(IMAGE_DIMENSIONS)` em vez de listar três strings, para que um dono novo
da Fase 10 (imagem de serviço, comprovante de pedido) entre sozinho sem ninguém lembrar de voltar
ao script.

### A ordem é truncate → limpar uploads → reseed (9.11)

O filesystem não participa da transação do Postgres, então a ordem decide qual inconsistência é
possível. Nesta, falhar no meio deixa banco e disco vazios **juntos**, e o próximo reset conserta. A
ordem inversa (limpar antes do truncate) deixaria linha de `ProductImage` — e `Pet.photoPath`,
`Brand.logoPath` — apontando para arquivo inexistente, que o ADR de storage classifica como mais
grave que um órfão no disco. Recusado também reusar a varredura do `cleanup-uploads.ts`: ela tem
carência de 24 h (`UPLOAD_ORPHAN_GRACE_HOURS`) e não removeria nada num reset, e baixar a carência
seria mexer na proteção pelo motivo errado.

### O `--dry-run` conta os arquivos que apagaria (9.11)

`DemoResetCounts` ganhou `uploadFiles` junto das oito chaves de tabela do catálogo. O dry-run existe
para se olhar antes de apertar o botão, e a partir da 9.11 a operação mais destrutiva do script
passou a ser justamente a que ele não mostrava. Contar dirent é leitura pura, então o contrato
read-only do dry-run continua intacto — e o número entra no `metadata` do `DEMO_RESET_EXECUTED`, que
é onde alguém vai olhar quando a demo amanhecer sem foto. Isso motivou o quinto método da interface
`Storage`, `countFiles(prefix)`: diferente do `exists` recusado acima, ele é chamado três vezes por
reset diário, e a alternativa era `fs.readdir` migrar para dentro do script, que é exatamente o que
o adaptador existe para evitar.

### `demo-reset` esquecia a tabela `previousEmail`

Ele truncava 8 tabelas na mesma ordem FK-safe de `clearDatabase()`, mas a `previousEmail` nasceu na
7.15, depois de a 7.14 ter sido escrita, e ninguém voltou para atualizar a lista. Na época, um email
trocado via `change-email` no demo ficaria **preso para sempre** mesmo após o reset diário, porque a
coluna era unique global. Esse efeito deixou de existir na 8.6 (o `@unique` saiu e `PreviousEmail`
parou de bloquear — ver
[identity-and-sessions.md](identity-and-sessions.md#o-unique-de-previousemailemail-saiu-junto-k25)),
mas o fix continua certo pelo motivo geral: a tabela é transacional e tem de voltar ao estado
inicial.

---

## Dataset fake

### Duas flags independentes: `SEED_FAKE_DATA` e `SEED_ADMIN_USER`

O dataset fake (customers/employees/híbridos) é seguro no demo público — mesmo com escrita
disponível via roles `manager`, o dano fica contido ao próprio dataset e o `demo-reset` diário
restaura. Já o usuário admin de teste tem acesso total (`*`): diferente do demo (só leitura, com
credencial pública assumida como risco baixo), uma conta de escrita irrestrita exposta na internet é
superfície de ataque real, mesmo com os dados voltando todo dia. Separar as flags permite ligar o
dataset fake em produção/demo sem nunca ligar o admin lá — `SEED_ADMIN_USER` só existe em
`.env.development`.

### O dataset inclui roles com escrita (`manager`), com o risco assumido

Sinalizado explicitamente antes de implementar (mesmo racional de "credencial pública, risco baixo,
dado sempre restaurável" do `DEMO_PASSWORD`): sem isso o dataset não demonstraria as features de
gestão de usuário (ban, force-password-reset, permission override) na prática. Aceito
conscientemente, não por omissão.

### A idempotência depende só do email fixo

A primeira versão do design cogitava semear nome/cpf/telefone com um `faker.seed()` fixo para o
dataset ser idêntico a cada reseed. Na implementação ficou claro que não é necessário: a checagem é
"existe um user com este email? se sim, pula" — uma vez criado, reruns nunca voltam a tocar
CPF/nome/telefone daquele registro. `cpf-cnpj-validator` (`cpf.generate()`) também não é
determinístico via seed do Faker (usa `Math.random` internamente), então perseguir determinismo total
exigiria mais uma dependência sem comprar nada: ninguém depende do CPF exato de um usuário fake.
Nome/telefone ainda usam seed fixo — estética, não a garantia de idempotência.

### Instância própria de Faker — e, desde a 9.11, semeada por chave

`@faker-js/faker` exporta um singleton compartilhado; chamar `.seed()` nele mudaria o stream de
valores consumido por qualquer teste que rode no mesmo processo depois de o módulo de seed ser
importado — flakiness sutil dependente de ordem de import. `new Faker({ locale: [en] })` isola
completamente os dois geradores, e isso continua valendo.

O que **mudou na 9.11** é como a instância é semeada. Até então ela recebia um `seed()` fixo uma
vez e era consumida em laço, o que a tornava uma **sequência**: inserir uma entrada no meio do
`FAKE_USER_ROSTER` deslocava o stream e mudava nome e telefone de toda entrada posterior. A
idempotência nunca dependeu disso (a chave é o email), mas os valores divergiam entre um banco
antigo e um recriado, e o roster tinha uma ordem que importava por acidente do gerador — numa
sessão que justamente apende ao roster, com a Fase 10 vindo atrás.

`src/lib/seed/seedFaker.ts` passa a resemear a instância a partir de uma **chave estável** (os 4
primeiros bytes do SHA-256 do email, ou do SKU nas variantes do catálogo). O roster volta a ser um
conjunto: reordenável e extensível sem efeito colateral. Custo pago uma vez: os nomes de todos os
fakes mudaram numa execução em banco novo — bancos existentes não mudam, porque o rerun pula quem
já existe.

### Os bytes das imagens do seed moram em base64 num `.ts`, não em disco (9.11)

O plano herdado da 9.10 previa "um punhado de `.webp` pequenos versionados em
`src/lib/seed/assets/`". Não funcionaria: o estágio `runtime` do `Dockerfile` copia
`node_modules`, `dist`, `prisma`, o `package.json` e o entrypoint — **nunca `src/`** —, e o tsup
empacota TS/JS ignorando `.webp`. Como o entrypoint de produção roda `migrate deploy → seed →
start` a cada boot, o seed simplesmente não encontraria arquivo nenhum, e o sintoma (demo sem foto)
não apontaria para a causa.

`src/lib/seed/fakeImages.constants.ts` guarda os 51 assets em base64 (~2 MB), gerado por
`tools/generate-fake-images.ts` a partir de um diretório `assets-inbox/` que **não é versionado**.
Recusadas as duas alternativas: um `COPY` novo no estágio runtime criaria a primeira dependência de
"arquivo ao lado do bundle" do projeto — classe de erro que só aparece em produção —, e gerar
placeholder em runtime com `sharp` sairia em branco, porque o `node:22-bookworm-slim` não traz fonte
nenhuma para renderizar `<text>` em SVG.

O arquivo fica fora do Biome (`files.includes` em `biome.json`): 2 MB excedem o limite de 1 MB por
arquivo, e formatar código gerado que ninguém lê não paga o ajuste.

### O seed grava imagem pelo adaptador, nunca copiando arquivo (9.11)

Tanto o catálogo quanto os pets fake passam por `storeImage` (`src/lib/storage/image.ts`), o mesmo
caminho que a API usa: magic bytes, `sharp`, dois derivados WebP, EXIF descartado. Copiar o arquivo
para dentro do `UPLOAD_DIR` seria mais rápido e produziria arquivo com **forma diferente** da que o
endpoint produz — e o descasamento só apareceria na demo.

### O seed não cura arquivo sumido; quem converge é o `demo-reset` (9.11)

Cenário real: o entrypoint de produção roda o seed a cada boot, e ele é idempotente por chave
estável, então pula o produto que já existe — e pula a imagem junto. Se o `UPLOAD_DIR` do host for
recriado vazio (host novo, disco trocado, faxina) enquanto o banco sobrevive, a demo passa a servir
404 em toda foto e nada no log diz por quê.

Aceito conscientemente. A correção "óbvia" seria um `exists(key)` na interface `Storage`, e ela foi
recusada: a interface é a costura para S3/MinIO, e um `exists` por imagem a cada boot vira uma
chamada de rede por imagem no dia em que o backend for remoto. O `demo-reset` roda diariamente por
systemd, trunca e repovoa — a janela é de no máximo um dia num ambiente de portfólio. O
`cleanup-uploads.ts` já reporta "linha sem arquivo" sem apagar, que é o sinal para quem for
investigar.

### Criado via `userRepository`, não via `user.service`

`user.service.createCustomer`/`createEmployee` dispara `issueEmailVerification` (email real, via
SMTP). Rodando o seed a cada boot do container, isso bombardearia o relay de emails de verificação
inúteis a cada restart. O repository (mesma técnica de `tests/factories/user.factory.ts`) cria sem o
efeito colateral, e o `status` é forçado por `prisma.user.update` depois — idêntico ao que os testes
já faziam.

---

## Achado de teste

### `clearDatabase` não era bug

Ele só apaga tabelas transacionais; `Feature`/`Role`/`RoleFeature` (seed do `globalSetup`) já eram
preservadas entre testes — que é o que as factories precisam. Ganhou teste-guarda
(`clearDatabase.guard.test.ts`) contra regressão futura.
