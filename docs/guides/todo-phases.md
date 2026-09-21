# As duas formas de uma fase no `todo.md`

O [`todo.md`](../todo.md) é o **índice** das fases, não o caderno de trabalho — o caderno é a
pasta da fase em [`.scratch/`](../../.scratch/) (`fase-<n>-<slug>/`). Cada fase aparece no índice de **uma de
duas formas**, e qual delas depende só de a fase estar aberta ou fechada.

## Fase aberta — enquanto está em execução

Poucas linhas, e um ponteiro. Nada de passo-a-passo, nada de pendência solta: isso tudo vive
nas issues.

```markdown
## 🔄 Fase <n> — <título>
> O recorte da fase em uma ou duas linhas, e o **ponteiro** para a pasta da fase:
> `.scratch/fase-<n>-<slug>/`, onde vivem a spec e as issues.
- Progresso: <k> de <total> issues fechadas.
```

Por que tão pouco: enquanto a fase corre, a spec e as issues são a fonte da verdade sobre o
que foi decidido e o que falta. Repetir aqui produz duas versões da mesma decisão envelhecendo
em ritmos diferentes — que foi exatamente o que aconteceu na Fase 9.

## Fase encolhida — assim que ela fecha

É a memória de resultado, e é **permanente**. O molde, praticado nas Fases 7, 8 e 9:

```markdown
## Fase <n> — <título> ✅
> Uma nota de abertura: o que a fase entregou, em quantas issues, e **os ponteiros** para
> onde o porquê mora agora (os ADRs).
- Um bullet por **grupo de issues**, dizendo o que ficou decidido e por quê — não o que
  foi planejado.
- …
- Fechos: o que o fecho corrigiu, e a suíte + `typecheck` + `lint` + `docs:check` verdes.
```

Ordem de grandeza: uma fase de 14 issues cabe em ~10 bullets. O detalhe de execução continua
recuperável — nas issues, que não são apagadas, e no histórico do git.

## As três regras da transição

1. **Encolher é trabalho de fecho da própria fase**, não da seguinte.
2. **Migrar antes de fechar.** Cada decisão nomeada na spec precisa ter dono em
   um ADR (do app, ou da raiz quando é de sistema) **antes** de a fase fechar. Decisão sem dono não fecha:
   escrever o dono é o trabalho. Na prática, isso quer dizer montar uma tabela de rastreio
   (decisão → arquivo de destino) e conferi-la.
3. **A spec é marcada, não apagada.** No fecho, a primeira linha do `spec.md` vira
   `Status: fechada em <AAAA-MM-DD> — porquê promovido a <caminhos>`, e o
   `pnpm docs:check` exige que os caminhos nomeados existam. É o marcador que repõe a
   força que o antigo "apagar a spec" dava à regra 2 — e é o que impede alguém de ler uma
   spec morta como corrente.

## Numeração

A numeração de fase é **global e nunca reinicia** — os "ciclos" agrupam a leitura, não a
contagem. O número da issue, ao contrário, é **local à fase** e reinicia em `01`. A convenção
de branch (`fase-<n>`, `feat/fase-<n>-<NN>-<slug>`) depende dessa combinação: dois "fase-1" em
ciclos diferentes, ou um `<NN>` global, tornariam o histórico ambíguo.
