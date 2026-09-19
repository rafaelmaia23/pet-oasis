# `.scratch/` — o tracker: specs e issues

Aqui vive o trabalho **em desenho e em execução**. É versionado: um esforço é uma pasta,
com a spec dele e uma issue por arquivo.

```
.scratch/                             ← na raiz do monorepo: um tracker para API, contratos e web
├── fase-10-frontline/
│   ├── spec.md                       ← o desenho negociado: o quê e por quê
│   └── issues/
│       ├── 01-rename-app-to-api.md   ← uma issue = uma feat-branch = um contexto
│       ├── 02-…
│       └── 23-…
└── monorepo/                         ← a Fase 11
```

## As regras

**Uma issue, um arquivo, uma branch.** A issue é uma fatia vertical: atravessa schema, API e
teste, e é verificável sozinha. O número é o da fase (`feat/fase-10-01-rename-app-to-api`),
nunca global.

**Bloqueio é texto.** Cada issue declara `**Blocked by:**` com os números que a travam, ou
"None (can start immediately)". A fronteira é o conjunto de issues abertas cujos bloqueadores
todos fecharam.

**Tudo aqui é citável.** Spec e issue são arquivos fixos, com endereço estável: um ADR pode
citar a issue que o originou, um comentário de `src/` pode apontar a spec — é assim que o fluxo
das skills funciona. A regra antiga ("documento permanente não cita o tracker") caiu na Fase 11;
o porquê, e o que ela acertava, está em
[`docs/adr/0001`](../docs/adr/0001-domain-docs-follow-the-skill.md). O que o `pnpm docs:check`
continua provando é que o caminho citado existe. A autoridade, porém, continua sendo do ADR: a
spec é o retrato de uma negociação num instante, e envelhece assim que a implementação diverge
dela — quem quer o *porquê* vigente lê o ADR, não a spec.

**Spec fechada é marcada, não apagada.** No fecho da fase, a primeira linha do `spec.md`
passa a ser:

```
Status: fechada em 2026-09-30 — porquê promovido a apps/api/docs/adr/NNNN-<slug>.md, docs/adr/NNNN-<slug>.md
```

O `docs:check` exige que os caminhos nomeados existam (ADRs do app, com o prefixo `apps/<app>/`, ou
ADRs de sistema em `docs/adr/` da raiz). É o que repõe a força que o antigo
"apagar a spec no fecho" dava à regra de **migrar antes de fechar**: o *porquê* precisa ter
dono permanente, e o marcador é a prova de que ele tem.

Sem a linha `Status:`, a spec é lida como aberta.

## O caminho de uma ideia até o código

O mapa completo da documentação está em [`docs/README.md`](../docs/README.md).
