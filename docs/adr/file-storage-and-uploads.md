# Upload de imagem: disco local atrás de um adaptador

> Decisão de infra registrada no planejamento da Fase 9 (sub-fase 9.10).
> Introduz um volume Docker novo e um ponto de escrita fora do Postgres —
> primeira vez que o projeto grava algo persistente que não é linha de banco.

## O problema

O catálogo (Fase 9) precisa de imagem de produto, e o pet (Fase 9) ganha um
campo `photoPath` previsto. As restrições do usuário são concretas: hospedagem
própria, VPS ARM64, **custo zero**, e a intenção declarada de aprender como
upload funciona de verdade (validação de arquivo, nome seguro, órfãos) — não
só "chamar um SDK de storage".

## Decisão ✅

### Disco local, atrás de um adaptador de storage

- Volume Docker montado no container da app; a app grava o arquivo e guarda
  **o path** no banco — nunca a URL completa, que amarraria o dado ao domínio.
  A base pública é derivada de env var.
- O **reverse proxy serve `/uploads/*` como estático**, sem passar por Node —
  poupa o processo da app do custo de servir binário.
- Um **adaptador** (`put`/`delete`/`url`) com implementação `LocalDiskStorage`.
  O service nunca sabe que existe disco. Se o VPS um dia apertar, trocar por
  R2/S3 é uma classe nova e uma env var — o mesmo corte que o repository já
  faz com o Prisma.

### O que o teste tem que guardar

- **Validação por magic bytes**, não por `Content-Type` (que o cliente
  escolhe livremente) nem por extensão do nome do arquivo.
- **Nome de arquivo gerado por nós** (uuid + extensão derivada do tipo real).
  Nome vindo do usuário é vetor de path traversal — nunca tocar no disco com
  ele.
- **Teto de tamanho** e **teto de quantidade** por produto.
- **Normalização/redimensionamento** (biblioteca `sharp`, roda bem em ARM64) —
  sem isso, um JPEG de 12 MB de câmera vira o padrão de armazenamento.
- **Órfãos:** produto excluído deixa arquivo para trás. Precisa de exclusão no
  mesmo fluxo **e** de um script de varredura — o projeto já tem o padrão
  (`src/scripts/` + systemd timer em `infra/cron/`, usado por
  `cleanup-sessions`/`cleanup-audit-log`/`demo-reset`).
- **Transacionalidade:** disco não participa da transação do Postgres. A
  ordem importa — gravar o arquivo primeiro, depois a linha; se a linha
  falhar, apagar o arquivo. Um arquivo órfão é muito menos grave que uma
  linha apontando para um arquivo inexistente.

### O ambiente demo é o ponto de atenção maior

Upload aberto na internet é abuso de disco garantido:

- A role `demo` **não** pode subir arquivo (é read-only por definição — mas
  vale o teste explícito, não só a ausência de feature).
- O `demo-reset` (Fase 7.14) passa a limpar o diretório de upload, dentro da
  guarda `DEMO_MODE=true` que já existe.
- Rate limit próprio para o endpoint de upload, e teto de tamanho agressivo —
  mais restritivo que o `express.json` geral (Fase 7.0), porque aqui o corpo
  é binário e potencialmente grande de propósito.

### Foto de pet reaproveita o mesmo adaptador

`Pet.photoPath` (Fase 9.4) só ganha endpoint quando o adaptador existir
(9.10). Se a ordem de implementação inverter, a coluna nasce sem quem a
alimente — aceitável, mas o adaptador vem primeiro sempre que possível.

## Alternativas consideradas

- **S3/R2 direto, sem adaptador:** economizaria uma camada de indireção hoje,
  mas contradiz a restrição de custo zero do usuário e a intenção didática de
  entender upload de verdade. Preterido para esta fase; é o gatilho de
  revisão abaixo.
- **Base64 no banco:** evitaria disco e volume, mas infla linha do Postgres
  com dado binário, quebra cache HTTP de imagem, e não é como upload de
  produção funciona — contradiz a intenção didática. Preterido.
- **Confiar em `Content-Type`/extensão para validar arquivo:** trivial de
  falsificar pelo cliente. Preterido — magic bytes é o único critério
  confiável.
- **Não ter script de varredura de órfãos:** aceitável só se a exclusão no
  mesmo fluxo fosse garantidamente atômica com o disco, o que não é o caso
  (disco fora da transação do Postgres). Preterido.

## Quando revisitar

- Se o disco do VPS entrar sob pressão real: trocar `LocalDiskStorage` por
  uma implementação S3/R2 do mesmo adaptador — troca de classe + env var, sem
  tocar em service.
- Se o volume de upload no ambiente demo se mostrar um vetor de abuso mesmo
  com os limites acima: considerar throttle adicional ou desativar upload
  público por completo, mantendo só leitura.

---

## Adendo — o que a implementação (9.10) firmou

> Escrito ao fim da sessão 9.10. Três pontos deste ADR foram cumpridos como
> escritos; dois foram **alterados pelo que a verificação encontrou**, e é isso
> que este adendo registra.

### O reverse proxy não está neste repositório — quem serve é o Node, por ora

O ADR dizia "o reverse proxy serve `/uploads/*` como estático, sem passar por
Node". A verificação mostrou que **não existe reverse proxy no repositório**:
`infra/docker-compose.prod.yml` só `expose:` a porta 3000 do serviço `api`, e quem a alcança
é um proxy de fora do repo. O proxy existe — é o
nginx do servidor pessoal onde a demo de portfólio é hospedada —, mas ele vive
fora do git, e nenhuma configuração dele é versionada aqui.

Servir por `express.static` foi a escolha, e o motivo não é preguiça: é ter
**um caminho só**. A alternativa (Node em dev, nginx em produção) criaria a
classe de bug "funciona na minha máquina, 404 no deploy" num ponto onde o
sintoma — imagem quebrada — não aponta para a causa.

O que preserva a promessa original é o volume ser **bind mount**, e não volume
nomeado: o arquivo fica visível no filesystem do host, que é o pré-requisito
para o nginx passar a servi-lo direto. No dia em que o tráfego justificar, a
mudança inteira é

```nginx
location /uploads/ { alias /srv/pet-oasis-data/uploads/; expires 30d; }
```

mais um `UPLOAD_PUBLIC_BASE_URL` novo. **Nada gravado no banco muda**, porque o
banco guarda a chave e nunca a URL — que era o ponto do ADR original e continua
valendo.

O caminho do host acima não é o do repo clonado por acidente: o diretório de
dados foi movido para **fora do working tree** na 10.4, porque lá dentro o git e
o container escrevem com uids diferentes. É a mesma propriedade — o banco guarda
a chave — que fez daquela mudança um `mv` e não uma migração de dados.

### `sharp` no ARM64: a condição que precisa ficar escrita

`sharp` roda bem em ARM64, como o ADR dizia, e o `Dockerfile`
(`node:22-bookworm-slim`, glibc) baixa o prebuild `@img/sharp-linux-arm64` sem
compilar libvips — nenhum passo novo de build.

A condição é que a imagem seja **construída no próprio servidor ARM**, que é o
que o `prod:up` faz hoje (o Compose tem `build:`). Construir num x86 e enviar a
imagem pronta quebra em runtime com `could not load the sharp module` — erro
que não se parece nada com a causa.

### Um request por imagem, e não um lote

Decidido na 9.10: o endpoint aceita **um arquivo por request**. O cliente que
deixa o usuário escolher oito fotos num gesto só dispara oito requests — e
ganha barra de progresso e retry **por imagem**. Um request com N arquivos
forçaria ou tudo-ou-nada (o usuário perde as sete que já tinham subido) ou uma
resposta de status misto que só este endpoint usaria; e, com `memoryStorage`,
seguraria 40 MB em RAM de uma vez.

### A varredura de órfãos não nasceu com timer

O ADR mandava seguir o padrão `src/scripts/` + systemd timer. O script existe
(`src/scripts/cleanup-uploads.ts`, `npm run db:cleanup-uploads`), o timer não —
e de propósito. Os `cleanup-*` que têm timer limpam crescimento **esperado e
contínuo** (todo login cria sessão). Órfão de upload só nasce de falha, e
agendar um evento que não deveria acontecer é ruído no `infra/cron/`. O timer
entra no dia em que a varredura encontrar algo duas vezes.

Duas decisões dentro dela merecem registro: a **carência** (arquivo mais novo
que `UPLOAD_ORPHAN_GRACE_HOURS` nunca é candidato, porque um arquivo gravado há
200ms cuja linha está sendo inserida agora é indistinguível de um órfão) e a
**direção inversa só reportar** (linha apontando para arquivo inexistente é
sintoma de bug nosso; apagar a linha faria o sintoma sumir levando a evidência
junto).

### O que o `demo-reset` ainda não faz

O ADR previa que o `demo-reset` limpasse o diretório de upload. Isso **não**
entrou na 9.10: limpar sem repovoar deixaria a vitrine da demo sem foto para
sempre, que é exatamente o que o seed fake existe para evitar. Os dois — a
limpeza e as imagens de exemplo — são da **9.11**, na sessão que os exercita.

A role `demo` já não sobe arquivo (não tem `manage:product` nem
`manage:catalog-structure`), e isso tem teste explícito, como o ADR pedia.
