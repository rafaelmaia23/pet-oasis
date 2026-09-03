# As duas formas de uma fase no `todo.md`

O [`todo.md`](../todo.md) guarda o trabalho ordenado, e cada fase aparece nele de **uma de
duas formas**. Qual delas depende só de a fase estar aberta ou fechada.

## Fase expandida — enquanto está em execução

É o caderno de trabalho. Cabe tudo que a execução precisa ter à mão:

- o cabeçalho `## Fase <n> — <título>` com o estado em emoji (`🔄`);
- uma nota `>` de abertura com o recorte da fase e os ponteiros (spec em
  [`docs/specs/`](../specs/), ADRs, arquivos de `context/`);
- a tabela de **decisões firmadas** no planejamento;
- a tabela das **sessões de trabalho**, uma linha por sub-fase, com o porquê da ordem;
- uma seção `### [Sessão <n>.<m>]` por sub-fase, com o kickoff em grelha, o passo-a-passo,
  o que a implementação corrigiu do próprio kickoff, e as pendências `🔸`.

**A pendência vai onde será executada, nunca para trás.** Ao fechar uma sub-fase, uma nota
para o futuro é escrita na seção da sessão que vai resolvê-la — se ela ainda não existe, crie
o placeholder. Anotar ao fim da seção recém-fechada garante que ninguém leia a nota na hora
certa.

## Fase encolhida — assim que ela fecha

É a memória de resultado, não o caderno. O molde, praticado nas Fases 7, 8 e 9:

```markdown
## Fase <n> — <título> ✅
> Uma nota de abertura: o que a fase entregou, em quantas sessões, e **os ponteiros** para
> onde o porquê mora agora (`context/`, ADRs).
- Um bullet por **grupo de sub-fases**, dizendo o que ficou decidido e por quê — não o que
  foi planejado.
- …
- Fechos (<n>.<última>): o que o fecho corrigiu, e a suíte + `typecheck` + `lint` verdes.
```

Ordem de grandeza: uma fase de 10 sessões cabe em ~10 bullets. O detalhe de execução
continua recuperável no histórico do git — não é perdido, é tirado do caminho.

## As três regras da transição

1. **Encolher é trabalho de fecho da própria fase**, não da seguinte. A fase que acabou não
   fica expandida "como exemplo": o exemplo é este guia.
2. **Migrar antes de apagar.** Cada decisão nomeada no expandido precisa ter dono em
   `docs/context/` ou em um ADR **antes** de a seção sumir. Decisão sem dono não é apagada:
   escrever o dono é o trabalho. Na prática, isso quer dizer montar uma tabela de rastreio
   (decisão → arquivo de destino) e conferi-la antes de qualquer remoção.
3. **A spec morre junto.** O documento de `docs/specs/` que originou a fase é apagado no
   mesmo fecho, pelo mesmo critério: o que sobreviveu já virou ADR ou contexto.

## Numeração

A numeração de fase é **global e nunca reinicia** — os "ciclos" agrupam a leitura, não a
contagem. A convenção de branch (`fase-<n>`, `feat/fase-<n>-<m>-<slug>`) depende de um número
único por fase; dois "fase-1" em ciclos diferentes tornariam o histórico ambíguo.
