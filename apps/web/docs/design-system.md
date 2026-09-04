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
o croma). A conversão acontece na implementação.

### Claro

| Papel | Valor | Uso |
|---|---|---|
| `primary` | `#2E6B5A` | Ação principal, links, estado ativo |
| `primary-hover` | `#3E8E75` | Hover e foco da primária |
| `background` | `#FAF8F4` | Fundo da página — creme, nunca branco puro |
| `surface` | `#FFFFFF` | Card, popover, linha de tabela |
| `foreground` | `#1C1F1D` | Texto — quase-preto com fundo verde, não cinza neutro |
| `muted` | `#6B7270` | Texto secundário, label, placeholder |
| `accent` | `#E4734A` | CTA secundário, promoção, badge de destaque |

### Escuro

Não é a paleta clara invertida. O fundo escuro é **quente** pelo mesmo motivo que o claro é
creme, e a primária precisa **clarear** para manter contraste sobre ele — o `#2E6B5A` some
no escuro.

| Papel | Direção | Ponto de partida |
|---|---|---|
| `primary` | Clarear em direção ao `primary-hover` | `#4FA88B` |
| `background` | Quase-preto quente, com traço verde | `#141715` → afinar na implementação |
| `surface` | Um degrau acima do fundo, nunca `#000` | — |
| `foreground` | Off-white quente, nunca `#FFF` puro | `#EDEAE3` |
| `accent` | Dessaturar levemente — coral puro vibra no escuro | — |

Todo par precisa passar **WCAG AA** (4.5:1 para texto de corpo, 3:1 para texto grande e
elemento de interface). Contraste é verificação, não estimativa.

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
