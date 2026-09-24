# 12: As rotas de pet passam ao registrador

**What to build:** as dez rotas de pet passam a sair da entrada da tabela, preservando o modo
fail-closed da autorização (o dono do pet não está na URL).

**Blocked by:** 08, 07.

**Status:** fechada em 2026-09-24

- [x] As 10 rotas migraram, um commit por rota (`290c351`..`aa7fc12`), suíte verde a cada uma
- [x] O caminho fail-closed continua fechado: `list` exige `read:pet:others` direto na rota; as
      demais usam a forma base e `resolveCustomer`/`resolvePet` (fail-closed) separam dono de
      staff — quem não tem `:others` não descobre a existência do pet de outro
- [x] A ligação do pet ao `Customer` e as regras de raça não foram tocadas
- [x] Nenhum status, corpo ou mensagem mudou; `apps/api/src/modules/pet/pet.routes.ts` não tem
      `router.<verbo>(` fora do `registerRoute` — confirmado pela busca da issue 15

**Achado à parte, corrigido aqui:** o merge (`8cf95ac`) e o código já estavam completos desde
2026-09-24; só faltava esta atualização de fechamento, registrada como pendência pela própria
issue 15.
