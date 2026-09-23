# 01: Acesso ao GitHub pelo `gh`

**What to build:** quem trabalha neste repo via agente consegue dar push e abrir PR sem uma mão
humana em cada entrega. Hoje o remoto é HTTPS com askpass de GUI e o `gh` não está instalado, então
todo push e todo PR do esforço param e esperam o dono da máquina.

**Blocked by:** None (can start immediately). Não bloqueia nenhuma outra issue deste esforço — o
esforço corre inteiro sem ela, com push e PR manuais.

**Status:** done

Exige `sudo` para instalar o pacote e um login interativo no navegador: são passos que só o dono da
máquina executa. A **forma de acesso é decisão dele**, entre duas:

- **`gh auth login` + `gh auth setup-git`** — mantém o remoto HTTPS e registra o `gh` como
  credential helper do Git. Ganha o `gh` para PR e CI de brinde; perde se o token expirar sem
  ninguém notar.
- **Chave SSH** — troca o remoto para `git@github.com:` e resolve o push sem token. Não dá acesso a
  PR pela linha de comando, então o `gh` continuaria fazendo falta para o resto.

- [x] `gh` instalado (2.97.0, do repo `updates` do Fedora 44) e `gh auth status` reportando
      autenticado como `rafaelmaia23`, protocolo `ssh`, escopos `repo`, `read:org`, `gist`,
      `admin:public_key`
- [x] `git push` funciona sem askpass de GUI: a `dev` foi publicada, e o push de uma branch nova
      foi provado em dry-run. `admin=true push=true` pela API
- [x] A forma escolhida está registrada (abaixo)
- [x] O `README.md` da raiz diz o que um clone novo precisa, junto do `corepack`/`pnpm install`
- [x] Continua valendo que **GitHub Issues não está em uso**: o `gh` aqui é para push, PR e CI, e
      nenhuma skill cria issue remota

## O que ficou

**As duas formas foram usadas, para trabalhos diferentes** — o levantamento mostrou que a escolha
que a issue propunha era falsa. Já existia uma chave SSH cadastrada e funcionando
(`~/.ssh/github-fedora`, com `IdentitiesOnly yes` no `~/.ssh/config`): o push falhava só porque o
remoto **deste clone** era HTTPS. Então:

- **transporte do git → SSH.** O remoto passou a ser `git@github.com:…`, o que resolve push e
  fetch sem token e sem askpass.
- **PR e CI → `gh`.** É o que o SSH não faz: `gh pr create`, `gh pr list`, `gh run list`.
  `gh auth login` foi feito com protocolo `ssh`, reusando a chave que já existia (nenhuma chave
  nova, nenhum upload).

**`--insecure-storage` não foi necessário.** O token ficou no keyring do sistema e ainda assim
`gh auth status` e `gh api` respondem de um Bash não-interativo — era o risco que a issue
antecipava, e ele não se concretizou. Se algum dia falhar (keyring trancado, por exemplo depois de
boot sem login gráfico), a saída conhecida é refazer o login com `--insecure-storage` ou exportar
`GH_TOKEN`; o token em texto não foi aceito de graça, e é essa a razão de ele não estar em uso.

**Efeito no esforço:** os PRs das issues seguintes passam a ser abertos pela linha de comando, e o
verde do CI é verificável daqui (`gh run list`) em vez de depender de alguém olhar o navegador.
