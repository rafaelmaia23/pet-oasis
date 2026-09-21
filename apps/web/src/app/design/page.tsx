import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Design system — Pet Oasis",
  description: "Paleta, tipografia e estados da direção Eucalipto & Creme.",
};

type Swatch = { token: string; role: string; showsForegroundSample?: boolean };

const PALETTE: { group: string; note: string; swatches: Swatch[] }[] = [
  {
    group: "Superfícies",
    note: "Do fundo da página para cima. Nenhuma é branco puro no claro nem preto puro no escuro.",
    swatches: [
      { token: "background", role: "Fundo da página" },
      { token: "card", role: "Card, popover, linha de tabela" },
      { token: "muted", role: "Superfície apagada e hover discreto" },
      { token: "secondary", role: "Botão e badge secundários" },
      { token: "accent", role: "Item de menu ativo, realce leve" },
      { token: "sidebar", role: "Fundo da navegação do back-office" },
    ],
  },
  {
    group: "Ação",
    note: "O eucalipto é a ação principal. O coral é destaque de superfície — nunca texto de corpo.",
    swatches: [
      {
        token: "primary",
        role: "Ação principal, link, estado ativo",
        showsForegroundSample: true,
      },
      {
        token: "primary-hover",
        role: "Hover e foco da primária",
        showsForegroundSample: true,
      },
      {
        token: "highlight",
        role: "CTA secundário, promoção, badge de destaque",
      },
      { token: "highlight-hover", role: "Hover do destaque" },
      {
        token: "destructive",
        role: "Ação destrutiva e mensagem de erro",
        showsForegroundSample: true,
      },
      {
        token: "destructive-hover",
        role: "Hover da destrutiva",
        showsForegroundSample: true,
      },
    ],
  },
  {
    group: "Texto",
    note: "Medidos contra fundo, card, superfície apagada e secundária. Todos em AA.",
    swatches: [
      {
        token: "foreground",
        role: "Texto principal",
        showsForegroundSample: true,
      },
      {
        token: "muted-foreground",
        role: "Texto secundário, label, placeholder",
        showsForegroundSample: true,
      },
    ],
  },
  {
    group: "Linhas e foco",
    note: "A borda de campo e o anel de foco são elemento de interface: alvo de 3:1, não de 4,5:1.",
    swatches: [
      { token: "border", role: "Divisória e borda de card" },
      { token: "input", role: "Borda de campo de formulário" },
      { token: "ring", role: "Anel de foco", showsForegroundSample: true },
    ],
  },
  {
    group: "Gráficos",
    note: "Cinco matizes espaçadas, com luminosidade escalonada de propósito: sob dicromacia a matiz colapsa e a luminosidade é o que sobra para separar duas séries. A série 1 é a própria primária.",
    swatches: [
      { token: "chart-1", role: "Série 1" },
      { token: "chart-2", role: "Série 2" },
      { token: "chart-3", role: "Série 3" },
      { token: "chart-4", role: "Série 4" },
      { token: "chart-5", role: "Série 5" },
    ],
  },
];

const PRICES = [
  { item: "Ração Premium Adulto 15 kg", price: "R$ 249,90" },
  { item: "Banho e tosa — porte médio", price: "R$ 89,00" },
  { item: "Coleira antipulgas", price: "R$ 1.117,45" },
  { item: "Brinquedo mordedor", price: "R$ 34,50" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function SwatchTile({ token, role, showsForegroundSample }: Swatch) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div
        className="flex h-16 items-end p-2"
        style={{ backgroundColor: `var(--${token})` }}
      >
        {showsForegroundSample ? (
          <span
            className="text-xs font-medium"
            style={{ color: `var(--${token}-foreground, var(--background))` }}
          >
            Aa
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5 bg-card p-2.5">
        <p className="font-mono text-xs">--{token}</p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}

/** A sequência vista como conjunto: série encostada em série é a única forma de
 *  julgar se duas continuam distinguíveis. */
function SeriesStrip() {
  const shares = [
    { token: "chart-1", share: 34 },
    { token: "chart-2", share: 26 },
    { token: "chart-3", share: 18 },
    { token: "chart-4", share: 13 },
    { token: "chart-5", share: 9 },
  ];
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex h-8 overflow-hidden rounded-md">
        {shares.map(({ token, share }) => (
          <div
            key={token}
            style={{ backgroundColor: `var(--${token})`, width: `${share}%` }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Série encostada em série, que é onde duas cores parecidas se denunciam.
      </p>
    </div>
  );
}

function PriceList({ label, numerals }: { label: string; numerals: string }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="mb-3 text-xs font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <ul className={`space-y-1 text-sm ${numerals}`}>
        {PRICES.map(({ item, price }) => (
          <li key={item} className="flex justify-between gap-4">
            <span className="truncate text-muted-foreground">{item}</span>
            <span>{price}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A mesma amostra renderizada nos dois temas, lado a lado, sem depender de qual
 *  está ativo: `.light` e `.dark` trocam os tokens dentro da própria subárvore. */
function ThemeSample({
  theme,
  label,
}: {
  theme: "light" | "dark";
  label: string;
}) {
  return (
    <div className={theme}>
      <div className="space-y-4 rounded-xl border bg-background p-5 text-foreground">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <div className="flex gap-1.5">
          {[
            "background",
            "card",
            "primary",
            "highlight",
            "destructive",
            "muted",
          ].map((token) => (
            <div
              key={token}
              className="size-8 rounded-md border"
              style={{ backgroundColor: `var(--${token})` }}
              title={`--${token}`}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Adicionar</Button>
          <Button size="sm" variant="secondary">
            Cancelar
          </Button>
          <Badge variant="highlight">Promoção</Badge>
        </div>
        <Input placeholder="tutor@exemplo.com.br" />
        <p className="text-sm">
          Texto de corpo em{" "}
          <span className="text-primary">Instrument Sans</span>, com{" "}
          <span className="text-muted-foreground">apoio apagado</span>.
        </p>
      </div>
    </div>
  );
}

export default function DesignSystemPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Pet Oasis
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Eucalipto &amp; Creme
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Amostra viva dos tokens. Todo token tem par claro e escuro, e
            nenhuma cor é definida só dentro de um tema. Os contrastes estão
            medidos —{" "}
            <code className="font-mono text-xs">pnpm run contrast</code> refaz a
            medição e falha se algum par cair abaixo de AA.
          </p>
        </div>
        <ThemeToggle />
      </header>

      <Separator />

      <Section
        title="Os dois temas"
        description="A mesma amostra nos dois temas ao mesmo tempo, independente do tema ativo. O seletor no topo tem três estados: claro, escuro e o do sistema — e a escolha explícita sobrevive a fechar o navegador."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <ThemeSample theme="light" label="Claro" />
          <ThemeSample theme="dark" label="Escuro" />
        </div>
      </Section>

      <Section
        title="Paleta"
        description="Um verde profundo e levemente azulado sobre um neutro quente. É o neutro quente que faz o trabalho de acolhedor."
      >
        <div className="space-y-8">
          {PALETTE.map(({ group, note, swatches }) => (
            <div key={group} className="space-y-3">
              <div>
                <h3 className="font-heading text-lg font-medium">{group}</h3>
                <p className="text-sm text-muted-foreground">{note}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {swatches.map((swatch) => (
                  <SwatchTile key={swatch.token} {...swatch} />
                ))}
              </div>
              {group === "Gráficos" ? <SeriesStrip /> : null}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Tipografia"
        description="Outfit nos títulos, Instrument Sans no corpo. As duas são auto-hospedadas no build: nenhuma requisição sai para um terceiro em tempo de execução."
      >
        <div className="space-y-6 rounded-xl border bg-card p-6">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight">
              Ração, banho e tosa em um lugar só
            </h1>
            <h2 className="text-2xl font-semibold tracking-tight">
              Título de seção
            </h2>
            <h3 className="text-lg font-medium">Título de bloco</h3>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Outfit · geométrica e arredondada, amigável sem ser infantil.
            </p>
          </div>
          <Separator />
          <div className="max-w-2xl space-y-2">
            <p>
              Corpo em Instrument Sans: humanista, altura-x alta e levemente
              condensada. A condensação é vantagem funcional — o back-office é
              tabela sobre tabela, e ela cabe mais em menos largura sem apertar.
            </p>
            <p className="text-sm text-muted-foreground">
              Apoio apagado, para label, placeholder e legenda.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Algarismos tabulares"
        description="Instrument Sans e Outfit trazem tnum. Toda tabela já sai tabular por padrão; para valor solto, a utilitária tabular-nums."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <PriceList
            label="Proporcional — as vírgulas não alinham"
            numerals="[font-variant-numeric:proportional-nums]"
          />
          <PriceList
            label="Tabular — a coluna fica legível"
            numerals="tabular-nums"
          />
        </div>
      </Section>

      <Section
        title="Estados"
        description="Botão, badge e campo em repouso, em hover, em foco, desabilitado e inválido. Percorra com Tab: o anel de foco é visível em tudo que é interativo."
      >
        <div className="space-y-6 rounded-xl border bg-card p-6">
          <div className="space-y-3">
            <h3 className="font-heading text-lg font-medium">Botão</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button>Principal</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="outline">Contorno</Button>
              <Button variant="ghost">Fantasma</Button>
              <Button variant="destructive">Excluir</Button>
              <Button variant="link">Link</Button>
              <Button disabled>Desabilitado</Button>
              <Button variant="highlight">Destaque</Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm">Pequeno</Button>
              <Button size="default">Padrão</Button>
              <Button size="lg">Grande</Button>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-heading text-lg font-medium">Badge</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Ativo</Badge>
              <Badge variant="secondary">Rascunho</Badge>
              <Badge variant="outline">Arquivado</Badge>
              <Badge variant="destructive">Banido</Badge>
              <Badge variant="highlight">Promoção</Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <h3 className="font-heading text-lg font-medium">Campo</h3>
            <div className="grid max-w-2xl gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="campo-normal">Email</Label>
                <Input id="campo-normal" placeholder="tutor@exemplo.com.br" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campo-invalido">Email</Label>
                <Input
                  id="campo-invalido"
                  aria-invalid
                  aria-describedby="campo-invalido-erro"
                  defaultValue="tutor@"
                />
                <p
                  id="campo-invalido-erro"
                  className="text-xs text-destructive"
                >
                  Informe um email válido.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="campo-desabilitado">CPF</Label>
                <Input
                  id="campo-desabilitado"
                  disabled
                  defaultValue="000.000.000-00"
                />
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Card"
        description="Superfície de card sobre o fundo creme, com o par escuro nascido junto."
      >
        <Card className="max-w-sm">
          <CardHeader>
            <CardTitle>Ração Premium Adulto</CardTitle>
            <CardDescription>Saco de 15 kg · sabor frango</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-semibold tabular-nums">R$ 249,90</p>
            <Badge variant="highlight">15% até domingo</Badge>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Adicionar ao carrinho</Button>
          </CardFooter>
        </Card>
      </Section>
    </main>
  );
}
