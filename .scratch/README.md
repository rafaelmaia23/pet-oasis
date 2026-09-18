# `.scratch/` — o tracker: specs e issues

Aqui vive o trabalho **em desenho e em execução**. É versionado: um esforço é uma pasta,
com a spec dele e uma issue por arquivo.

```
.scratch/
└── fase-10-frontline/
    ├── spec.md                       ← o desenho negociado: o quê e por quê
    └── issues/
        ├── 01-rename-app-to-api.md   ← uma issue = uma feat-branch = um contexto
        ├── 02-…
        └── 14-…
```

## As regras

**Uma issue, um arquivo, uma branch.** A issue é uma fatia vertical: atravessa schema, API e
teste, e é verificável sozinha. O número é o da fase (`feat/fase-10-01-rename-app-to-api`),
nunca global.

**Bloqueio é texto.** Cada issue declara `**Blocked by:**` com os números que a travam, ou
"None (can start immediately)". A fronteira é o conjunto de issues abertas cujos bloqueadores
todos fecharam.

**Nada aqui é citável por documento permanente.** ADR, `docs/context/`, `README.md`,
`CLAUDE.md` e comentário de `src/` não referenciam `.scratch/` — versionar mudou a
durabilidade do arquivo, não a autoridade do conteúdo. Uma spec é o retrato de uma
negociação num instante, e envelhece assim que a implementação diverge dela. Só o
[`docs/todo.md`](../docs/todo.md) aponta para cá, e o `pnpm run docs:check` reprova quem
esquecer.

**Spec fechada é marcada, não apagada.** No fecho da fase, a primeira linha do `spec.md`
passa a ser:

```
Status: fechada em 2026-09-30 — porquê promovido a docs/adr/<nome>.md, docs/context/<tema>.md
```

O `docs:check` exige que os caminhos nomeados existam. É o que repõe a força que o antigo
"apagar a spec no fecho" dava à regra de **migrar antes de fechar**: o *porquê* precisa ter
dono permanente, e o marcador é a prova de que ele tem.

Sem a linha `Status:`, a spec é lida como aberta.

## O caminho de uma ideia até o código

O mapa completo da documentação está em [`docs/README.md`](../docs/README.md).
