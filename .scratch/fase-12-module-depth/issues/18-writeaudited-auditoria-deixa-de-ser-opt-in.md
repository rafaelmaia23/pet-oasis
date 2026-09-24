# 18: A auditoria deixa de ser opt-in de quem chama

**What to build:** uma escrita que deve deixar rastro passa a **declarar** o descriptor de auditoria
em vez de recebê-lo como opcional. Hoje trinta e cinco assinaturas de repositório carregam o
descriptor como opcional e treze repetem o mesmo corpo de dois braços — escrita simples quando não
vem descriptor, transação com o registro de auditoria quando vem. A consequência: uma chamada nova
que esquece o argumento grava estado sem rastro, e é indistinguível de um no-audit deliberado.

**Esta issue começa por um ADR**, antes do código: a regra "com transação a falha de auditoria desfaz
a ação; sem transação, não" é depth real e hoje só é alcançável por treze cópias; mover isso mexe em
território que o ADR-0098, o ADR-0099 e o ADR-0100 da API já delimitaram — a escrita transacional é
do repositório, o registro é de lib, e lib não conhece módulo.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-24

O que de fato ficou pronto:

- [x] ADR novo na API —
      `apps/api/docs/adr/0205-writeaudited-colapsa-escrita-auditada-descritor-obrigatorio.md`, com a
      linha em `apps/api/docs/adr/README.md` —, escrito **antes** do código: `writeAudited` mora em
      `src/lib/auditLog.ts`, ao lado de `record` (mesmo dono do ADR-0099/ADR-0100), e onde a ação não
      é sempre rastreada (`verificationToken.repository.ts`, que atende quatro purposes e só três têm
      ação na taxonomia) o parâmetro continua opcional, fora do escopo do helper.
- [x] `writeAudited(audit, work)` recebe um `AuditDescriptor` — ou `(result) => AuditDescriptor`
      quando o descritor depende do que a escrita produziu (o id gerado pelo banco, uma contagem de
      cascata) — e a função que roda dentro da `$transaction`; abre a transação, roda `work`, grava o
      audit nela e devolve o resultado. O braço duplicado desapareceu dos doze sites com esse exato
      formato (a issue estimou treze; a diferença é o `applyUpdate` de brand/category/pet, que era um
      só site reusado por três exports) — brand, category, tag, pet, user, permission, product,
      auth.repository e user.profile.repository.
- [x] O helper é agnóstico de módulo: só conhece `Prisma.TransactionClient` e `AuditDescriptor` — lib
      continua sem importar nada de `modules/`.
- [x] O parâmetro `audit` virou obrigatório (sem `?`) em toda escrita cuja ação está na taxonomia
      fechada (`apps/api/docs/reference/logging-policy.md` §4.3) — 36 assinaturas ao todo, contando as que já
      abriam a transação sempre e só chamavam `record` condicionalmente. Isso expôs que os seeds de
      dados fake e as factories/fixtures de teste que escrevem direto pelo repository (para não
      passar pelo ator que o service exige) também estavam nesse "sem rastro" silencioso — ganharam
      descritores reais (`docs/adr/0205` documenta a decisão, tomada com o usuário: fixture de teste
      é tão call site quanto o service, não um escape hatch).
- [x] A semântica "com transação a falha de auditoria desfaz a ação" está num lugar só —
      `tests/unit/lib/auditLog.test.ts`, describe `auditLog.writeAudited` — e cobre também o caso sem
      transação (`auditLog.record`, já existente). Um teste de integração equivalente em
      `audit.test.ts` foi removido: dependia de `vi.spyOn` num export que `writeAudited` agora chama
      como binding local do mesmo arquivo, e nenhum spy de fora do módulo alcança essa chamada.
- [x] O que já era auditado continua auditado, com o mesmo conteúdo de linha — suíte completa (88
      arquivos, 1452 testes) verde. Os poucos testes que assumiam contagem exata de audit log sem
      filtrar por `action` foram ajustados: criar um reader/admin de teste agora também audita
      (`USER_CREATED`), então a contagem sem filtro cresceu em um. `typecheck`, `lint` e `docs:check`
      verdes; `code-review` (medium) achou dois pontos, corrigidos: `actorId` faltando em duas
      linhas do seed e um wrapper de teste duplicado em quatro arquivos, agora um helper só
      (`tests/helpers/audit.ts`).
