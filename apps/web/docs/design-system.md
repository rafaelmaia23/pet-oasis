# Design System — Pet Oasis Web

Direção visual **"Eucalipto & Creme"**. A leitura do mercado é que o verde de pet shop é
quase sempre o mesmo verde saturado de farmácia (Cobasi), ou é trocado por azul lúdico
(Petz). O espírito próprio aqui vem de duas escolhas que se sustentam mutuamente: um verde
**profundo e levemente azulado** em vez do verde-bandeira, sobre um neutro **quente** em vez
do cinza-azulado padrão do shadcn. É o neutro quente que faz o trabalho de "acolhedor" —
sem precisar de pata de cachorro em cada canto.

---

## ⚠️ Regra — toda cor e todo componente nasce com a versão dark

Sem exceção. Escolheu cor, define o par claro/escuro. Criou componente, ele funciona nos
dois temas antes de ser considerado pronto. Não é uma feature a ligar depois: é disciplina
de autoria, porque o custo de retrofitar dark numa paleta já espalhada é reescrevê-la
inteira. Se o seletor de tema nunca for exposto ao usuário, nada foi perdido.

---

## Paleta

Valores canônicos em hex; os tokens são **escritos em `oklch`** nas custom properties (é o
espaço de cor que o Tailwind 4 e o shadcn 4 usam, e é o que faz clarear/escurecer preservar
o croma). O hex de cada linha abaixo é o que aquele `oklch` de fato renderiza; `pnpm run
contrast` imprime o hex de cada token que mede, o que é como esta tabela é conferida contra
o `src/app/globals.css`.

O escuro **não** é a paleta clara invertida. O fundo escuro é quente pelo mesmo motivo que o
claro é creme, e a primária **clareia** para manter contraste sobre ele: o `#2E6B5A` some no
escuro.

| Token | Claro | Escuro | Papel |
|---|---|---|---|
| `--background` | `#FAF8F4` | `#141715` | Fundo da página — creme, nunca branco puro |
| `--foreground` | `#1C1F1D` | `#EDEAE3` | Texto principal |
| `--card` | `#FFFFFF` | `#1C201E` | Card, popover, linha de tabela |
| `--card-foreground` | `#1C1F1D` | `#EDEAE3` | Texto sobre card |
| `--popover` | `#FFFFFF` | `#1C201E` | Popover e menu flutuante |
| `--popover-foreground` | `#1C1F1D` | `#EDEAE3` | Texto sobre popover |
| `--primary` | `#2E6B5A` | `#4FA88B` | Ação principal, link, estado ativo |
| `--primary-foreground` | `#FFFFFF` | `#0E1211` | Texto sobre a primária |
| `--primary-hover` | `#33846C` | `#66BCA0` | Hover e foco da primária |
| `--secondary` | `#EDE8DF` | `#262B28` | Botão e badge secundários |
| `--secondary-foreground` | `#1C1F1D` | `#EDEAE3` | Texto sobre a secundária |
| `--muted` | `#F1ECE3` | `#222724` | Superfície apagada, hover discreto |
| `--muted-foreground` | `#616665` | `#919A95` | Texto secundário, label, placeholder |
| `--accent` | `#E6EDE9` | `#2A302C` | Item de menu ativo, realce leve de superfície |
| `--accent-foreground` | `#1C1F1D` | `#EDEAE3` | Texto sobre o realce |
| `--highlight` | `#DF6F46` | `#D08256` | CTA secundário, promoção, badge de destaque |
| `--highlight-foreground` | `#1C1F1D` | `#1C1F1D` | Texto sobre o destaque |
| `--highlight-hover` | `#F28057` | `#E39367` | Hover do destaque |
| `--destructive` | `#C0392B` | `#E5645A` | Ação destrutiva e mensagem de erro |
| `--destructive-foreground` | `#FFFFFF` | `#141715` | Texto sobre a destrutiva |
| `--destructive-hover` | `#AD2519` | `#F9756A` | Hover da destrutiva |
| `--border` | `#E3DDD1` | `#2F3532` | Divisória e borda de card |
| `--input` | `#958E80` | `#656D68` | Borda de campo de formulário |
| `--ring` | `#2E6B5A` | `#4FA88B` | Anel de foco |
| `--chart-1` | `#2E6B5A` | `#4FA88B` | Série 1 de gráfico — é a própria primária |
| `--chart-2` | `#BD5B38` | `#FC9F7F` | Série 2 de gráfico |
| `--chart-3` | `#B18A30` | `#F5CF7D` | Série 3 de gráfico |
| `--chart-4` | `#4073B3` | `#7BACEB` | Série 4 de gráfico |
| `--chart-5` | `#6B2758` | `#A85990` | Série 5 de gráfico |
| `--sidebar` | `#F4F0E9` | `#181C1A` | Fundo da navegação do back-office |
| `--sidebar-foreground` | `#1C1F1D` | `#EDEAE3` | Texto na navegação |
| `--sidebar-primary` | `#2E6B5A` | `#4FA88B` | Item ativo da navegação |
| `--sidebar-primary-foreground` | `#FFFFFF` | `#0E1211` | Texto do item ativo |
| `--sidebar-accent` | `#E6EDE9` | `#2A302C` | Hover da navegação |
| `--sidebar-accent-foreground` | `#1C1F1D` | `#EDEAE3` | Texto no hover da navegação |
| `--sidebar-border` | `#E3DDD1` | `#2F3532` | Divisória da navegação |
| `--sidebar-ring` | `#2E6B5A` | `#4FA88B` | Anel de foco na navegação |

### Como a paleta chegou nestes valores

Os pontos de partida do documento original eram `#2E6B5A` (primária), `#FAF8F4` (fundo),
`#1C1F1D` (texto), `#6B7270` (apagado), `#E4734A` (destaque), `#3E8E75` (hover), `#4FA88B`
(primária escura), `#141715` (fundo escuro) e `#EDEAE3` (texto escuro). Todos sobreviveram,
exceto três que a medição de contraste puxou:

| Papel | Partida | Entregue | Por quê |
|---|---|---|---|
| `--primary-hover` (claro) | `#3E8E75` | `#33846C` | Branco sobre `#3E8E75` dá 3,94:1. O hover é um estado de texto de corpo como qualquer outro; escurecer o mínimo leva a 4,51:1 |
| `--highlight` (claro) | `#E4734A` | `#DF6F46` | Como superfície de elemento de interface precisa de 3:1 contra o fundo creme, e `#E4734A` dá 2,89:1 |
| `--muted-foreground` (claro) | `#6B7270` | `#616665` | Passava sobre o fundo (4,64:1), mas caía a 4,03:1 sobre a superfície secundária, onde label e placeholder também aparecem |

Uma quarta caiu depois, quando a medição passou a compor transparência: `muted-foreground`
escuro `#8F9893` → `#919A95`, porque o placeholder de um campo no tema escuro aparece sobre
`bg-input/30` composto no fundo, e ali ele dava 4,47:1.

O coral **é superfície, nunca texto de corpo**: sobre o fundo creme ele dá 3,05:1, o que
serve para badge e botão e não serve para parágrafo. Quem quiser escrever em coral está
pedindo a coisa errada.

**Toda cor de ação tem hover próprio.** `--primary-hover`, `--highlight-hover` e
`--destructive-hover` seguem o mesmo padrão: mesma matiz, luminosidade deslocada, e o par
`X-foreground` sobre `X-hover` entra na medição. O padrão existe porque a alternativa do
shadcn — `hover:bg-primary/80` — é transparência, e transparência muda de cor conforme o que
está atrás; foi assim que dois estados de hover entraram abaixo de AA sem ninguém ver.

### A sequência de gráfico

Cinco séries categóricas: eucalipto (172°), coral (40°), ocre (85°), ardósia (255°) e ameixa
(340°). A **série 1 é exatamente a `--primary`**, para que um gráfico continue parecendo desta
loja; as outras quatro espaçam a roda a partir dela.

**A luminosidade varia de propósito, e é a parte que importa.** A tentação é montar a
sequência com luminosidade constante, que é o que fica bonito num quadrado de amostra. Sob
dicromacia isso desaba: a matiz colapsa num eixo só, coral e ocre viram a mesma cor, e o
gráfico perde duas séries. Medido — com a sequência plana em L, a menor distância entre duas
séries sob deuteranopia era **0,013**; escalonando a luminosidade ela sobe para **0,061**.

Por isso a sequência escalona L dentro do que cada tema permite: no claro entre 0,39 e 0,655,
teto imposto pelo piso de 3:1 contra o card branco; no escuro entre 0,575 e 0,87, piso imposto
pelo mesmo 3:1 contra o fundo. As matizes que colapsam juntas sob a mesma dicromacia são as
que recebem os L mais afastados.

`pnpm run contrast` mede as duas coisas: 3:1 de cada série contra fundo e card, e a menor
distância entre duas séries sob visão normal, deuteranopia, protanopia e tritanopia, com piso
de 0,05. A tabela está no fim deste documento.

Nenhum gráfico existe ainda — mas os componentes do shadcn referenciam estes tokens, e a
alternativa era deixá-los no cinza padrão dele, fora da direção.

---

## Tipografia

- **Títulos: Outfit.** Geométrica, arredondada, amigável sem ser infantil.
- **Corpo: Instrument Sans.** Humanista, altura-x alta, proporção levemente condensada — a
  condensação é vantagem funcional, não gosto: o back-office é tabela sobre tabela e ela
  cabe mais em menos largura sem apertar.

Ambas via `next/font`, **auto-hospedadas em build**: nenhuma request ao Google em runtime,
melhor LCP e melhor privacidade.

**Algarismos tabulares (`font-variant-numeric: tabular-nums`) em toda tabela e todo valor
monetário.** Números que mudam de largura entre linhas tornam uma coluna de preços ilegível.

O recurso existe nas duas fontes, e isso foi **verificado nos arquivos que o build serve**,
não presumido: a tabela `GSUB` dos dois `.woff2` gerados pelo `next/font` traz as features
`tnum` e `pnum`. Não há alternativa a resolver — nenhuma das duas precisou ser trocada nem
acompanhada de uma fonte de números à parte.

Na prática: `<table>` já sai tabular por uma regra de base no `globals.css`; para valor solto
fora de tabela — o que o componente `Money` vai fazer — a utilitária `tabular-nums`.

---

## Forma e movimento

- **Raio base `0.75rem`.** Generoso: arredondado lê como amigável, e é o que separa esta
  interface da densidade de hipermercado das referências.
- **`tw-animate-css`** para o trivial (entrada, saída, colapso) — é o que o shadcn 4 já usa.
- **Motion 13** só onde ganha: entrada de lista, feedback de sucesso, painel deslizante.
- **View Transitions** na navegação da vitrine.

> **Nada acima de 200ms no caminho crítico.** Animação que atrasa o usuário é bug, não
> charme. O teste é: se a animação estivesse ausente, a interface pareceria quebrada ou
> apenas mais rápida? Se for "mais rápida", corte.

---

## Componentes

shadcn 4 reconfigurado sobre os tokens acima — não o tema default. Sobre ele, compostos
próprios, e estes quatro existem desde o primeiro dia porque o domínio os exige:

| Componente | Por que existe |
|---|---|
| **`Money`** | A API devolve **centavos inteiros**. Formatar `priceCents` ad-hoc espalhado pela árvore é exatamente como nasce bug de dinheiro |
| **`DataTable`** | O back-office é tabela com filtro, ordenação e paginação; o estado vive em `searchParams` (ADR-0002) e a tabela tem que falar essa língua |
| **`FormField`** | O 422 da API vem com `errors` por campo; o campo precisa saber receber isso |
| **`EmptyState`** | Lista vazia é o estado mais comum de um sistema novo e o mais esquecido |

---

## Implementação

Os tokens vivem em [`src/app/globals.css`](../src/app/globals.css), em duas regras e só duas:

- **`:root, .light`** — o tema claro **e** a base de todo token. Toda cor do projeto nasce
  aqui. `.light` divide a mesma declaração com `:root` sem repetir um único valor: é a classe
  que o `next-themes` escreve no `<html>`, e é o que permite forçar o tema claro numa
  subárvore (a amostra lado a lado em `/design`).
- **`.dark`** — só sobrescreve. Nenhuma cor tem sua única definição aqui, e `pnpm run contrast`
  falha se alguma tiver.

Acima delas, um bloco `@theme inline` que só faz ponte: `--color-x: var(--x)`, para que as
utilitárias do Tailwind enxerguem os tokens. Nenhum valor mora ali. Não existe
`tailwind.config.js`.

### Duas colisões de nome com o shadcn, resolvidas

**O `accent` do documento não é o `accent` do shadcn.** Aqui `accent` sempre significou o
coral de destaque; no shadcn ele é a superfície neutra de hover e de item de menu ativo.
Reaproveitar o nome pintaria de coral todo hover de menu da aplicação. O coral entrou como
**`--highlight` / `--highlight-foreground`**; o `--accent` do shadcn ficou com o papel dele.

**`primary-hover` não é um conceito do shadcn**, que resolve hover com `bg-primary/80`. O
token existe porque o documento nomeia uma cor específica para o estado, e a variante
`default` do `Button` foi apontada para ele. Daí saiu o padrão: `--highlight-hover` e
`--destructive-hover` existem pelo mesmo motivo.

### O que foi mexido nos componentes do shadcn

Os arquivos em `src/components/ui/` são gerados pelo CLI e devem continuar parecendo
gerados. Três edições deliberadas fogem disso, e cada uma tem motivo medido:

| Arquivo | Edição | Por quê |
|---|---|---|
| `button.tsx`, `badge.tsx` | `hover:bg-primary/80` → `hover:bg-primary-hover` | O documento nomeia uma cor para o hover, e a versão translúcida ficava em 4,00:1 no `Badge` |
| `button.tsx`, `badge.tsx` | `variant="destructive"` sólido, no lugar do tingido `bg-destructive/10` | O tingido cai a 4,02:1 sobre a superfície apagada no claro e 3,78:1 sobre o card no escuro |
| `button.tsx`, `badge.tsx` | `variant="highlight"` acrescentada | O coral é papel de primeira classe do documento; repetir `bg-highlight text-highlight-foreground` na chamada era o começo de uma variante não escrita |
| `label.tsx` | supressão de `noLabelWithoutControl` | Primitivo de design system: o vínculo com o campo é de quem usa, e a regra não tem como ser satisfeita ali |

### Tema

Três estados — claro, escuro e o do sistema — por `next-themes` com `attribute="class"`, o
que casa com a variante `dark` do Tailwind 4 deste projeto (`&:is(.dark *)`). A escolha
explícita é guardada no navegador e vence a preferência do sistema; sem escolha, o sistema
manda. A configuração vive só em
[`src/components/theme-provider.tsx`](../src/components/theme-provider.tsx) — o resto da
aplicação fala com o tema por `useTheme()`.

O seletor é um grupo de três botões
([`theme-toggle.tsx`](../src/components/theme-toggle.tsx)), não um interruptor de dois
estados: "o do sistema" é uma escolha de primeira classe e não teria como ser expressa num
botão que só alterna.

### Amostra

[`/design`](../src/app/design/page.tsx) mostra paleta, tipografia, algarismos tabulares e
estados de componente, com uma seção que renderiza os dois temas ao mesmo tempo — sem
depender de qual está ativo.

---

## Contraste medido

Gerado por `pnpm run contrast`, que lê os tokens do próprio `globals.css`, mede cada par e
**sai com erro** se algum cair abaixo do alvo. Alvo de 4,5:1 para texto de corpo e 3:1 para
elemento de interface — borda de campo, anel de foco e superfície de destaque. O mesmo
comando falha se algum token existir num tema e não no outro.

**A lista de pares é o que os componentes desenham, não o produto cartesiano dos tokens.**
Escrever todos contra todos produziria falhas em pares que ninguém renderiza — `destructive`
como texto sobre a superfície de hover de menu, por exemplo — e forçaria a paleta a se
contorcer por uma combinação imaginária. Fica de fora, também de propósito, a borda
decorativa (`--border`): ela não delimita controle nenhum e não carrega informação.

**Superfície translúcida entra composta.** Onde o componente pinta `bg-input/30` ou
`hover:bg-muted/50`, o par declara a opacidade e o fundo sobre o qual ela é composta, porque
é a cor composta que a pessoa enxerga e nenhum token guarda esse valor. Foi essa conta que
pegou o `variant="destructive"` do shadcn (`text-destructive` sobre `bg-destructive/10`, que
cai a 4,02:1 sobre a superfície apagada) e o hover do `Badge` padrão — os dois foram
apontados para tokens sólidos.

Refaça a medição depois de mexer em qualquer cor. As tabelas abaixo são a saída do comando.

### Claro

| Frente | Fundo | Medido | Alvo | |
|---|---|---|---|---|
| `--foreground` #1C1F1D | `--background` #FAF8F4 | 15.67:1 | 4.5:1 | AA |
| `--foreground` #1C1F1D | `--card` #FFFFFF | 16.62:1 | 4.5:1 | AA |
| `--foreground` #1C1F1D | `--muted` #F1ECE3 | 14.13:1 | 4.5:1 | AA |
| `--foreground` #1C1F1D | `--secondary` #EDE8DF | 13.62:1 | 4.5:1 | AA |
| `--foreground` #1C1F1D | `--accent` #E6EDE9 | 13.98:1 | 4.5:1 | AA |
| `--popover-foreground` #1C1F1D | `--popover` #FFFFFF | 16.62:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--background` #FAF8F4 | 5.48:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--card` #FFFFFF | 5.81:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--muted` #F1ECE3 | 4.94:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--secondary` #EDE8DF | 4.76:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--accent` #E6EDE9 | 4.89:1 | 4.5:1 | AA |
| `--muted-foreground` #616665 | `--sidebar` #F4F0E9 | 5.12:1 | 4.5:1 | AA |
| `--primary` #2E6B5A | `--background` #FAF8F4 | 5.88:1 | 4.5:1 | AA |
| `--primary` #2E6B5A | `--card` #FFFFFF | 6.24:1 | 4.5:1 | AA |
| `--primary` #2E6B5A | `--muted` #F1ECE3 | 5.30:1 | 4.5:1 | AA |
| `--primary` #2E6B5A | `--secondary` #EDE8DF | 5.11:1 | 4.5:1 | AA |
| `--primary` #2E6B5A | `--accent` #E6EDE9 | 5.24:1 | 4.5:1 | AA |
| `--primary-foreground` #FFFFFF | `--primary` #2E6B5A | 6.24:1 | 4.5:1 | AA |
| `--primary-foreground` #FFFFFF | `--primary-hover` #33846C | 4.51:1 | 4.5:1 | AA |
| `--secondary-foreground` #1C1F1D | `--secondary` #EDE8DF | 13.62:1 | 4.5:1 | AA |
| `--accent-foreground` #1C1F1D | `--accent` #E6EDE9 | 13.98:1 | 4.5:1 | AA |
| `--highlight-foreground` #1C1F1D | `--highlight` #DF6F46 | 5.14:1 | 4.5:1 | AA |
| `--highlight-foreground` #1C1F1D | `--highlight-hover` #F28057 | 6.35:1 | 4.5:1 | AA |
| `--destructive` #C0392B | `--background` #FAF8F4 | 5.13:1 | 4.5:1 | AA |
| `--destructive` #C0392B | `--card` #FFFFFF | 5.44:1 | 4.5:1 | AA |
| `--destructive-foreground` #FFFFFF | `--destructive` #C0392B | 5.44:1 | 4.5:1 | AA |
| `--destructive-foreground` #FFFFFF | `--destructive-hover` #AD2519 | 6.89:1 | 4.5:1 | AA |
| `--sidebar-foreground` #1C1F1D | `--sidebar` #F4F0E9 | 14.63:1 | 4.5:1 | AA |
| `--sidebar-foreground` #1C1F1D | `--sidebar-accent` #E6EDE9 | 13.98:1 | 4.5:1 | AA |
| `--sidebar-primary-foreground` #FFFFFF | `--sidebar-primary` #2E6B5A | 6.24:1 | 4.5:1 | AA |
| `--sidebar-accent-foreground` #1C1F1D | `--sidebar-accent` #E6EDE9 | 13.98:1 | 4.5:1 | AA |
| `--secondary-foreground` #1C1F1D | `--secondary` a 80% sobre `--background` = #F0EBE3 | 14.02:1 | 4.5:1 | AA |
| `--input` #958E80 | `--background` #FAF8F4 | 3.07:1 | 3.0:1 | AA |
| `--input` #958E80 | `--card` #FFFFFF | 3.26:1 | 3.0:1 | AA |
| `--ring` #2E6B5A | `--background` #FAF8F4 | 5.88:1 | 3.0:1 | AA |
| `--ring` #2E6B5A | `--card` #FFFFFF | 6.24:1 | 3.0:1 | AA |
| `--highlight` #DF6F46 | `--background` #FAF8F4 | 3.05:1 | 3.0:1 | AA |
| `--highlight` #DF6F46 | `--card` #FFFFFF | 3.23:1 | 3.0:1 | AA |
| `--chart-1` #2E6B5A | `--background` #FAF8F4 | 5.88:1 | 3.0:1 | AA |
| `--chart-1` #2E6B5A | `--card` #FFFFFF | 6.24:1 | 3.0:1 | AA |
| `--chart-2` #BD5B38 | `--background` #FAF8F4 | 4.19:1 | 3.0:1 | AA |
| `--chart-2` #BD5B38 | `--card` #FFFFFF | 4.44:1 | 3.0:1 | AA |
| `--chart-3` #B18A30 | `--background` #FAF8F4 | 3.01:1 | 3.0:1 | AA |
| `--chart-3` #B18A30 | `--card` #FFFFFF | 3.20:1 | 3.0:1 | AA |
| `--chart-4` #4073B3 | `--background` #FAF8F4 | 4.59:1 | 3.0:1 | AA |
| `--chart-4` #4073B3 | `--card` #FFFFFF | 4.86:1 | 3.0:1 | AA |
| `--chart-5` #6B2758 | `--background` #FAF8F4 | 9.64:1 | 3.0:1 | AA |
| `--chart-5` #6B2758 | `--card` #FFFFFF | 10.22:1 | 3.0:1 | AA |

### Escuro

| Frente | Fundo | Medido | Alvo | |
|---|---|---|---|---|
| `--foreground` #EDEAE3 | `--background` #141715 | 15.02:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--card` #1C201E | 13.71:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--muted` #222724 | 12.63:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--secondary` #262B28 | 11.98:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--accent` #2A302C | 11.22:1 | 4.5:1 | AA |
| `--popover-foreground` #EDEAE3 | `--popover` #1C201E | 13.71:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--background` #141715 | 6.27:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--card` #1C201E | 5.72:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--muted` #222724 | 5.27:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--secondary` #262B28 | 5.00:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--accent` #2A302C | 4.68:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--sidebar` #181C1A | 5.98:1 | 4.5:1 | AA |
| `--primary` #4FA88B | `--background` #141715 | 6.28:1 | 4.5:1 | AA |
| `--primary` #4FA88B | `--card` #1C201E | 5.73:1 | 4.5:1 | AA |
| `--primary` #4FA88B | `--muted` #222724 | 5.28:1 | 4.5:1 | AA |
| `--primary` #4FA88B | `--secondary` #262B28 | 5.01:1 | 4.5:1 | AA |
| `--primary` #4FA88B | `--accent` #2A302C | 4.69:1 | 4.5:1 | AA |
| `--primary-foreground` #0E1211 | `--primary` #4FA88B | 6.56:1 | 4.5:1 | AA |
| `--primary-foreground` #0E1211 | `--primary-hover` #66BCA0 | 8.32:1 | 4.5:1 | AA |
| `--secondary-foreground` #EDEAE3 | `--secondary` #262B28 | 11.98:1 | 4.5:1 | AA |
| `--accent-foreground` #EDEAE3 | `--accent` #2A302C | 11.22:1 | 4.5:1 | AA |
| `--highlight-foreground` #1C1F1D | `--highlight` #D08256 | 5.55:1 | 4.5:1 | AA |
| `--highlight-foreground` #1C1F1D | `--highlight-hover` #E39367 | 6.82:1 | 4.5:1 | AA |
| `--destructive` #E5645A | `--background` #141715 | 5.42:1 | 4.5:1 | AA |
| `--destructive` #E5645A | `--card` #1C201E | 4.94:1 | 4.5:1 | AA |
| `--destructive-foreground` #141715 | `--destructive` #E5645A | 5.42:1 | 4.5:1 | AA |
| `--destructive-foreground` #141715 | `--destructive-hover` #F9756A | 6.69:1 | 4.5:1 | AA |
| `--sidebar-foreground` #EDEAE3 | `--sidebar` #181C1A | 14.33:1 | 4.5:1 | AA |
| `--sidebar-foreground` #EDEAE3 | `--sidebar-accent` #2A302C | 11.22:1 | 4.5:1 | AA |
| `--sidebar-primary-foreground` #0E1211 | `--sidebar-primary` #4FA88B | 6.56:1 | 4.5:1 | AA |
| `--sidebar-accent-foreground` #EDEAE3 | `--sidebar-accent` #2A302C | 11.22:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--input` a 30% sobre `--background` = #2C312E | 11.05:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--input` a 50% sobre `--background` = #3C423E | 8.57:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--input` a 30% sobre `--background` = #2C312E | 4.61:1 | 4.5:1 | AA |
| `--foreground` #EDEAE3 | `--muted` a 50% sobre `--background` = #1B1F1D | 13.87:1 | 4.5:1 | AA |
| `--muted-foreground` #919A95 | `--muted` a 50% sobre `--background` = #1B1F1D | 5.79:1 | 4.5:1 | AA |
| `--secondary-foreground` #EDEAE3 | `--secondary` a 80% sobre `--background` = #222724 | 12.62:1 | 4.5:1 | AA |
| `--input` #656D68 | `--background` #141715 | 3.37:1 | 3.0:1 | AA |
| `--input` #656D68 | `--card` #1C201E | 3.08:1 | 3.0:1 | AA |
| `--ring` #4FA88B | `--background` #141715 | 6.28:1 | 3.0:1 | AA |
| `--ring` #4FA88B | `--card` #1C201E | 5.73:1 | 3.0:1 | AA |
| `--highlight` #D08256 | `--background` #141715 | 6.03:1 | 3.0:1 | AA |
| `--highlight` #D08256 | `--card` #1C201E | 5.50:1 | 3.0:1 | AA |
| `--chart-1` #4FA88B | `--background` #141715 | 6.28:1 | 3.0:1 | AA |
| `--chart-1` #4FA88B | `--card` #1C201E | 5.73:1 | 3.0:1 | AA |
| `--chart-2` #FC9F7F | `--background` #141715 | 8.96:1 | 3.0:1 | AA |
| `--chart-2` #FC9F7F | `--card` #1C201E | 8.18:1 | 3.0:1 | AA |
| `--chart-3` #F5CF7D | `--background` #141715 | 12.13:1 | 3.0:1 | AA |
| `--chart-3` #F5CF7D | `--card` #1C201E | 11.07:1 | 3.0:1 | AA |
| `--chart-4` #7BACEB | `--background` #141715 | 7.70:1 | 3.0:1 | AA |
| `--chart-4` #7BACEB | `--card` #1C201E | 7.02:1 | 3.0:1 | AA |
| `--chart-5` #A85990 | `--background` #141715 | 3.86:1 | 3.0:1 | AA |
| `--chart-5` #A85990 | `--card` #1C201E | 3.52:1 | 3.0:1 | AA |

### Séries de gráfico — Claro

| Visão | Menor distância | Par | Piso | |
|---|---|---|---|---|
| normal | 0.120 | `--chart-2` / `--chart-3` | 0.05 | ok |
| deuteranopia | 0.061 | `--chart-2` / `--chart-3` | 0.05 | ok |
| protanopia | 0.082 | `--chart-1` / `--chart-2` | 0.05 | ok |
| tritanopia | 0.061 | `--chart-1` / `--chart-4` | 0.05 | ok |

### Séries de gráfico — Escuro

| Visão | Menor distância | Par | Piso | |
|---|---|---|---|---|
| normal | 0.119 | `--chart-2` / `--chart-3` | 0.05 | ok |
| deuteranopia | 0.075 | `--chart-2` / `--chart-3` | 0.05 | ok |
| protanopia | 0.079 | `--chart-1` / `--chart-2` | 0.05 | ok |
| tritanopia | 0.055 | `--chart-1` / `--chart-4` | 0.05 | ok |
