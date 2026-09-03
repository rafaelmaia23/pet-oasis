# Fase 9.11 — Imagens que preciso receber

> **Documento temporário.** Existe só para você juntar os arquivos antes de a
> sessão 9.11 começar. É apagado no fecho da fase (item anotado na 9.12) — o que
> sobra no repositório é o `src/lib/seed/fakeImages.constants.ts` gerado a partir
> daqui.

## O que fazer

1. Crie a pasta `assets-inbox/` na raiz do repositório (ela entra no
   `.gitignore` — os originais **não** são versionados; só o base64 derivado é).
2. Ponha os arquivos da tabela lá dentro, com **exatamente** o nome da coluna
   "arquivo".
3. Me avise. Eu redimensiono, converto para WebP, gero o arquivo de constantes
   em base64 e apago a pasta.

Não precisa redimensionar, recortar nem converter nada — só não mandar arquivo
menor que o mínimo pedido, porque não há upscale (`withoutEnlargement: true`).

## Restrições de formato

- **JPEG, PNG ou WebP.** Nada de GIF nem AVIF: o `detectImageFormat` os recusa
  por magic bytes, deliberadamente (9.10/AA5).
- Logo em PNG com fundo transparente é bem-vindo — a transparência sobrevive à
  conversão para WebP.
- Nome do arquivo importa; extensão não (o formato é lido dos magic bytes).

## Logos das marcas — 9 arquivos

Mínimo **512 px** no lado maior.

| Arquivo | Marca | Ramo que ela ocupa no catálogo |
|---|---|---|
| `logo-golden.png` | Golden | Alimentação (ração seca, petiscos) |
| `logo-whiskas.png` | Whiskas | Alimentação (ração úmida, ração seca de gato) |
| `logo-pedigree.png` | Pedigree | Alimentação (ração seca de cão, ração úmida, petiscos) |
| `logo-sanol.png` | Sanol | Higiene e Beleza (shampoo, condicionador, tapetes) |
| `logo-bravecto.png` | Bravecto | Saúde > Antipulgas |
| `logo-vetnil.png` | Vetnil | Saúde > Suplementos |
| `logo-chalesco.png` | Chalesco | Acessórios (coleiras e guias, comedouros) |
| `logo-jambo.png` | Jambo | Conforto (camas, casinhas) |
| `logo-furacao-pet.png` | Furacão Pet | Brinquedos, Acessórios |

> A Beefer saiu e a **Pedigree** entrou no lugar: não havia logo boa da Beefer
> em tamanho utilizável, e a Pedigree cobre Alimentação melhor. O ramo de
> Higiene fica coberto sozinho pela Sanol.

## Fotos de produto — 13 arquivos

Mínimo **800 px** no lado menor. Uma por folha da árvore de categorias; dentro
da folha, os produtos repetem a mesma foto.

| Arquivo | Categoria (folha) |
|---|---|
| `produto-racao-seca-cao.jpg` | Alimentação > Ração > Ração seca (cão) |
| `produto-racao-seca-gato.jpg` | Alimentação > Ração > Ração seca (gato) |
| `produto-racao-umida.jpg` | Alimentação > Ração > Ração úmida (sachê ou lata) |
| `produto-petiscos.jpg` | Alimentação > Petiscos |
| `produto-shampoo.jpg` | Higiene e Beleza > Banho > Shampoo |
| `produto-condicionador.jpg` | Higiene e Beleza > Banho > Condicionador |
| `produto-tapete-higienico.jpg` | Higiene e Beleza > Tapetes higiênicos |
| `produto-antipulgas.jpg` | Saúde > Antipulgas (caixa ou pipeta) |
| `produto-suplemento.jpg` | Saúde > Suplementos (pote ou frasco) |
| `produto-coleira.jpg` | Acessórios > Coleiras e guias |
| `produto-comedouro.jpg` | Acessórios > Comedouros |
| `produto-cama.jpg` | Conforto > Camas |
| `produto-casinha.jpg` | Conforto > Casinhas |
| `produto-brinquedo.jpg` | Brinquedos |

## Fotos de pet — 3 arquivos

Mínimo **800 px** no lado menor. Cobrem os pets do roster que têm foto
(cerca de metade).

| Arquivo | Uso |
|---|---|
| `pet-cao.jpg` | Pets `DOG` |
| `pet-gato.jpg` | Pets `CAT` |
| `pet-outro.jpg` | Espécie sem raça (ave ou roedor) |

## O que acontece com eles depois

Cada arquivo vira uma constante base64 em `src/lib/seed/fakeImages.constants.ts`
e é gravado pelo **adaptador de storage** (`storeImage`), não copiado para o
`UPLOAD_DIR` — o seed produz arquivo com exatamente a mesma forma que a API
produz (dois derivados `-full.webp` e `-thumb.webp`, EXIF descartado pelo
`.rotate()`). O base64 é o único caminho que sobrevive ao build: o estágio
`runtime` do `Dockerfile` não copia `src/`, e o tsup não empacota `.webp`.
