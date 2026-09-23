# 01: Acesso ao GitHub pelo `gh`

**What to build:** quem trabalha neste repo via agente consegue dar push e abrir PR sem uma mão
humana em cada entrega. Hoje o remoto é HTTPS com askpass de GUI e o `gh` não está instalado, então
todo push e todo PR do esforço param e esperam o dono da máquina.

**Blocked by:** None (can start immediately). Não bloqueia nenhuma outra issue deste esforço — o
esforço corre inteiro sem ela, com push e PR manuais.

**Status:** ready-for-human

Exige `sudo` para instalar o pacote e um login interativo no navegador: são passos que só o dono da
máquina executa. A **forma de acesso é decisão dele**, entre duas:

- **`gh auth login` + `gh auth setup-git`** — mantém o remoto HTTPS e registra o `gh` como
  credential helper do Git. Ganha o `gh` para PR e CI de brinde; perde se o token expirar sem
  ninguém notar.
- **Chave SSH** — troca o remoto para `git@github.com:` e resolve o push sem token. Não dá acesso a
  PR pela linha de comando, então o `gh` continuaria fazendo falta para o resto.

- [ ] `gh` instalado e `gh auth status` reportando autenticado
- [ ] `git push` funciona sem askpass de GUI, provado num push real
- [ ] A forma escolhida está registrada na issue (qual das duas, e por quê)
- [ ] O guia de contribuição/dev diz o que um clone novo precisa fazer para ter o mesmo acesso
- [ ] Continua valendo que **GitHub Issues não está em uso**: o `gh` aqui é para push, PR e CI, e
      nenhuma skill cria issue remota
