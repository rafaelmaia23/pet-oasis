# 02: Tokens, tema claro e escuro, tipografia

**What to build:** a identidade visual do projeto existe e funciona nos dois temas. Uma
pessoa vê a aplicação no tema do sistema, consegue escolher claro ou escuro explicitamente, e
sua escolha sobrevive a fechar o navegador.

Direção "Eucalipto & Creme", conforme o documento de design system.

**Blocked by:** 01

**Status:** done

- [x] Todos os tokens definidos como custom properties, no espaço de cor do Tailwind 4
- [x] **Cada token tem par claro e escuro.** Nenhuma cor existe só num dos temas
- [x] Nenhuma cor tem sua única definição dentro de um bloco de tema — todo token tem base
- [x] Outfit e Instrument Sans carregadas de forma auto-hospedada no build; nenhuma requisição
      a terceiro em tempo de execução
- [x] Algarismos tabulares disponíveis para tabela e valor monetário. Se a fonte de corpo não
      oferecer o recurso, a alternativa está resolvida e registrada no documento de design
- [x] Seletor de tema com três estados: claro, escuro e o do sistema
- [x] A escolha explícita persiste entre visitas e vence a preferência do sistema
- [x] Todo par de cor de texto sobre fundo atinge WCAG AA, **medido** e registrado — não
      estimado
- [x] shadcn instalado e apontado para os tokens do projeto, não para o tema padrão dele
- [x] Uma página de amostra mostra paleta, tipografia e estados nos dois temas

## Comments

Entregue em `feat/02-design-tokens-and-theming`.

**Onde ficou cada coisa.** Os 35 tokens vivem em `src/app/globals.css`, em duas regras: uma
`:root, .light` que é o tema claro **e** a base de todo token, e uma `.dark` que só
sobrescreve. Acima delas, um `@theme inline` que é ponte pura (`--color-x: var(--x)`) e não
guarda valor nenhum. `.light` divide a declaração com `:root` sem repetir um valor sequer — é
a classe que o `next-themes` escreve no `<html>`, e é o que permite forçar um tema numa
subárvore.

**A medição é um comando, não uma tabela escrita à mão.** `npm run contrast` lê os tokens do
próprio `globals.css`, mede 81 pares e **sai com erro** se algum cair abaixo do alvo — 4,5:1
para texto de corpo, 3:1 para elemento de interface. O mesmo comando também falha se algum
token existir num tema e não no outro. A saída está registrada no fim de
`docs/design-system.md`.

A lista de pares é **o que os componentes desenham**, não o produto cartesiano dos tokens:
todos contra todos produziria falha em combinação que ninguém renderiza — `destructive` como
texto sobre a superfície de hover de menu, por exemplo — e torceria a paleta por uma
exigência imaginária. O critério está escrito no `docs/design-system.md`, junto com o que
fica de fora e por quê.

Quatro cores do documento original não passaram e foram puxadas o mínimo necessário, com o
motivo registrado na tabela "Como a paleta chegou nestes valores":

- `primary-hover` claro `#3E8E75` → `#33846C` — branco sobre ele dava 3,94:1.
- `highlight` (o coral) claro `#E4734A` → `#DF6F46` — dava 2,89:1 contra o fundo creme.
- `muted-foreground` claro `#6B7270` → `#616665` — caía a 4,03:1 sobre a superfície
  secundária, onde label e placeholder também aparecem.
- `muted-foreground` escuro `#8F9893` → `#919A95` — o placeholder no escuro aparece sobre
  `bg-input/30` composto no fundo, e ali dava 4,47:1.

**Duas colisões de nome com o shadcn.** O `accent` do documento de design é o coral; o
`accent` do shadcn é a superfície neutra de hover e de item de menu ativo. Reaproveitar o nome
pintaria de coral todo hover de menu da aplicação, então o coral entrou como `--highlight`,
com uma variante `highlight` no `Button` e no `Badge` para que a chamada não repita o par de
classes. E `primary-hover` não é conceito do shadcn (que resolve hover com `bg-primary/80`):
o token existe porque o documento nomeia uma cor para o estado. Ambas registradas em
`docs/design-system.md`, junto com a tabela do que foi mexido nos componentes gerados.

**Algarismos tabulares: verificado, não presumido.** As duas fontes têm `tnum` — conferido
lendo a tabela `GSUB` dos `.woff2` que o build de fato serve, não a documentação delas. Não
houve alternativa a resolver. `<table>` já sai tabular por regra de base; para valor solto,
a utilitária `tabular-nums`, que é o que o `Money` vai usar.

**shadcn 4 com Base UI** (o preset `base-nova` é o padrão do CLI 4), Lucide para ícone.
`components.json` aponta o CSS para `src/app/globals.css`, e o tema default dele foi
substituído inteiro pelos tokens do projeto. Componentes trazidos: `button`, `card`, `badge`,
`input`, `label`, `separator`, `toggle` e `toggle-group` — só o que a amostra e o seletor
usam. `shadcn` e `tw-animate-css` foram movidos para `devDependencies`: são build-time (CLI e
`@import` de CSS), e o `npm ci` do Dockerfile instala dev.

**O seletor é um grupo de três botões, não um interruptor.** "O do sistema" é uma escolha de
primeira classe e não teria como ser expressa num botão que só alterna.

**Como o comportamento do tema foi provado.** Firefox headless via Marionette, com o sistema
em escuro: estado inicial `system` → `.dark`; escolher claro → `.light` e `theme=light`
guardado; recarregar → continua claro, vencendo o sistema escuro; voltar para "do sistema" →
`.dark` de novo. Não virou teste automatizado: o navegador entra no projeto no ticket 03, e a
ADR-0005 não quer teste que afirme sobre markup.

**Uma supressão de lint.** `noLabelWithoutControl` no `Label` do shadcn: é primitivo de design
system, o vínculo com o campo é de quem usa, e a regra não tem como ser satisfeita ali.
Suprimida no arquivo, com motivo.

**O que a revisão pegou, e que a primeira volta não tinha.** A medição só sabia ler token
sólido, então era cega para a transparência que os componentes do shadcn usam — e três pares
compostos estavam abaixo de AA sem aparecer em lugar nenhum:

- `variant="destructive"` do `Button` e do `Badge`: `text-destructive` sobre
  `bg-destructive/10` dá 4,02:1 sobre a superfície apagada no claro e 3,78:1 sobre o card no
  escuro. Os dois foram apontados para tokens sólidos — o botão de excluir agora é vermelho
  cheio, não tingido.
- Hover do `Badge` padrão: `bg-primary/80` com `text-primary-foreground` dá 4,00:1 no claro.
  Apontado para `--primary-hover`.
- Placeholder de campo no escuro sobre `dark:bg-input/30`: 4,47:1. Resolvido clareando
  `--muted-foreground` escuro.

O `contrast-check` passou a aceitar par com `alpha` e `over`, então a cor composta entra na
medição como qualquer outra, e `only` marca o par que só existe num tema porque a classe que
o desenha é `dark:`. Daí saíram `--destructive-hover` e `--highlight-hover`: se toda cor de
ação tem hover próprio e sólido, nenhum hover volta a escapar da medição por transparência.

**Duas coisas que precisam de decisão sua, e que eu não tomei.**

1. **A sequência de cor de gráfico.** `--chart-3/4/5` são três matizes que ninguém escolheu.
   Entraram porque os componentes do shadcn referenciam esses tokens e a alternativa era
   deixá-los no cinza padrão dele, fora da direção. Estão marcados como **provisórios** no
   documento e na amostra; quem desenhar o primeiro gráfico decide de verdade.
2. **`/design` é rota pública de produção**, linkada da home. Ninguém pediu que fosse nem que
   não fosse. Se a amostra não deve ficar no ar junto da loja, é uma linha no `middleware` da
   fatia seguinte.

**O que ficou de fora de propósito.** Os compostos `Money`, `DataTable`, `FormField` e
`EmptyState` — a spec é explícita em que eles nascem na fatia que os usa. Motion 13, View
Transitions e os tokens de gráfico têm lugar reservado mas nenhum uso ainda.
