# O bundle do Scalar é servido por `root` + arquivo relativo, porque sob pnpm o caminho real passa por `.pnpm/` (11.1)

> Decisão da Fase 11 (issue 01), nascida na execução e registrada no fecho da fase (issue 13).
> Emenda a [`0130`](0130-auto-hospedar-bundle-scalar-vez-allowlistar-cdn.md), que decidiu
> auto-hospedar o bundle; aqui está o *como*, e por que ele mudou com o pnpm. Contexto de
> execução em `.scratch/fase-11-monorepo/issues/01-pnpm-single-package.md`.

Auto-hospedar o bundle do Scalar (`0130`) exige resolver, em runtime, onde o arquivo do pacote
está. `createRequire(...).resolve("@scalar/api-reference")` devolve o caminho **real** — e sob
pnpm, que instala por store com links em vez de árvore achatada, esse caminho real atravessa
`node_modules/.pnpm/@scalar+api-reference@…/`. O `res.sendFile` do Express recusa qualquer
caminho com segmento iniciado por ponto (`dotfiles: "ignore"` é o default, e é a proteção que
impede servir `.env` ou `.git`): o que funcionava com o npm passou a responder 404 com o pnpm,
e o sintoma — a página `/reference` abrindo em branco — não aponta para a causa.

**Decidimos separar o diretório do arquivo**: o caminho absoluto vai em `root`, onde o `send`
não aplica a checagem de dotfile, e só o trecho relativo (`browser/standalone.js`, sem segmento
com ponto) é inspecionado. É o `scalarBundleRoot`/`scalarBundleFile` de
[`src/docs/reference.ts`](../../src/docs/reference.ts).

As alternativas foram recusadas por motivos diferentes: ligar `dotfiles: "allow"` desarmaria a
proteção para **toda** a rota, e o valor dela não tem nada a ver com o Scalar; copiar o bundle
para um diretório próprio no build acrescentaria um passo ao Dockerfile e um artefato a
versionar ou a esquecer de atualizar; e embutir o caminho no build faria dev (`tsx`) e produção
(bundle do tsup) resolverem coisas diferentes — resolver em runtime é o que mantém os dois no
mesmo código, já que o pacote é dependência de produção e está no `node_modules` da imagem
podada.

Vale como regra além deste caso: **sob pnpm, caminho resolvido em runtime não pode ser passado
a uma API que filtre por dotfile** — e o layout do `node_modules` deixa de ser detalhe de
instalação no dia em que o código lê o filesystem.
