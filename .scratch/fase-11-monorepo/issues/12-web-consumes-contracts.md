# 12: O web consome o contrato

**What to build:** o web depende de `@pet-oasis/api-contracts` por `workspace:*` e o
`typecheck` dele passa importando um schema de request e uma view de resposta reais (por
exemplo, o schema de login e a view `me`). É o smoke que prova o objetivo da fase: uma mudança
de contrato na API quebra o `typecheck` do web no mesmo PR. Nenhuma tela é construída — isso é
a Fase 12.

**Blocked by:** 11, 16, 17 — a view de sessão e a tabela de rotas precisam existir no contrato
para que o smoke seja real (revisto em 2026-09-21).

**Status:** fechada em 2026-09-22

O que de fato ficou pronto — onde divergiu do plano, o porquê está ao lado:

- [x] `@pet-oasis/api-contracts` por `workspace:*` nas **dependências** do web, mais `zod`
      pelo `catalog:` — o web escreve `z.infer` sobre os schemas do contrato, e o pnpm é
      estrito: sem declarar, o import não resolve. O `^build` do `typecheck` no `turbo.jsonc`
      já dava a ordem e agora dá a invalidação: medido que tocar um arquivo do contrato tira
      o `typecheck` do web do cache (`cache hit` → `cache miss`), que é o que o comentário do
      `turbo.jsonc` prometia e ninguém tinha exercido pelo lado do web.
- [x] `apps/web/src/lib/api-contract.ts`: o módulo de prova, com **uma ponta por export** —
      `parseLoginForm`/`LOGIN_FIELDS` (schema de **request**), `Me`/`featuresOf` (**view** de
      resposta) e `meEndpoint` (**tabela de rotas**). Nenhuma tela foi tocada.
      **Divergência achada na implementação:** a primeira versão tinha só `parseLoginForm`, e
      ela **não** era prova de nada — `safeParse` recebe `unknown`, então renomear
      `password` → `secret` no contrato deixava o web verde. Daí o `LOGIN_FIELDS`, amarrado a
      `keyof LoginBody`: é ele que faz a ponta do request quebrar. A view entra só como tipo
      (`import type`), como manda o ADR-0003 do web.
- [x] Prova negativa feita e desfeita, nas **três** pontas (o enunciado pedia uma):
      `loginSchema.body.password` → `secret` dá `TS2322`; `meViews.default.features` →
      `effectiveFeatures` dá `TS2339`; `routes.me.get` → `routes.me.fetch` dá `TS2339`. O
      contrato foi restaurado nas três.
- [x] `next build` verde com o contrato — **com uma ressalva que o code-review pegou e que
      fica registrada em vez de maquiada**: no estado commitado nenhum arquivo de
      `apps/web/src` importa o módulo de prova (não se constrói tela nesta issue), então quem
      cobre o contrato no `next build` é o `tsc` que o Next roda, não o bundler. A prova de
      bundle foi feita com uma página descartável — e desfeita junto. O bundle de servidor,
      que é exatamente o risco que o `transpilePackages` cobre, só fica provado de pé quando
      algo importar o contrato pra valer: isso virou **critério novo na issue 03 da Fase 12**,
      onde o `apiFetch` é importado por um Server Component. Pendência anotada no lugar da
      execução, não aqui.
- [x] **Medida que contraria a expectativa da spec:** o
      Turbopack do Next 16 compila o fonte TS do pacote **mesmo sem** `transpilePackages` —
      testado com uma página importando o módulo, com e sem a linha. A linha ficou assim
      mesmo, e o `next.config.ts` explica por quê: é ela que fixa o comportamento, e o risco
      que ela cobre é o do bundle de **servidor**, onde um pacote externalizado vira
      `require()` de um `.ts` e quebra depois do deploy, não no build. Anotado também no
      README do contrato, que prometia `transpilePackages` como "a única configuração que o
      web precisa" — agora a promessa é medida, e são duas (mais o `zod`).
- [x] O CI enxerga a dependência: com o contrato tocado, o `--affected` que o
      `.github/workflows/ci.yml` roda passa de `['//', '@pet-oasis/web']` (só as mudanças do
      web) para `['//', '@pet-oasis/api', '@pet-oasis/api-contracts', '@pet-oasis/web']`.
      Antes desta issue não havia aresta nenhuma entre o contrato e o web.
- [x] Fase 12 ajustada: a spec ganhou o bullet "os schemas vêm do contrato, nunca de cópia, e
      a fiação já está feita", e a issue `03` teve dois critérios marcados como feitos aqui
      (dependência + `transpilePackages`, e a prova negativa) e o do `apiFetch` reescrito para
      dizer que ele **toma o lugar** de `api-contract.ts`, que sai no mesmo commit — em vez de
      o módulo de prova apodrecer ao lado do cliente de verdade.
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm docs:check` e a suíte inteira (1367 testes da API +
      os do pacote) verdes.
- [x] Code-review nos dois eixos. O que ele mudou: o box de prova negativa da issue 03 da
      Fase 12 voltou a **desmarcado** (estava marcado ao lado de uma nota dizendo que a prova
      se refaz lá — box marcado com trabalho pendente é contradição); `LoginBody` passou a
      sair de `loginSchema.shape.body`, a mesma via do `parseLoginForm`, em vez de duas vias
      para o mesmo corpo no mesmo arquivo; o comentário do `^build` no `turbo.jsonc` explica
      que "nó vazio" não quer dizer "não invalida"; e a Stack do `CLAUDE.md` do web passou a
      nomear o `zod` direto. **O que ele apontou e ficou como está:** o módulo não tem teste
      próprio — a guarda real aqui é o `typecheck`, que roda no CI e quebra nas três pontas,
      e montar Vitest no web é trabalho declarado da issue 03 da Fase 12, não desta. O risco
      que sobra é alguém **enfraquecer** o módulo (foi o que a primeira versão dele era), e
      contra isso o que existe é revisão, não teste. `featuresOf` devolver `readonly
      string[]` em vez de `FeatureName[]` é decisão do contrato — do que a view `me` põe na
      rede —, então não se mexe aqui: está levantado para o dono do projeto decidir.
