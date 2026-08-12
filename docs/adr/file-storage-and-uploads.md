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
