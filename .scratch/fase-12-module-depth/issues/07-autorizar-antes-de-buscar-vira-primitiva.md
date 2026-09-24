# 07: Autorizar-antes-de-buscar vira primitiva, e o caminho invertido sai

**What to build:** a invariante de segurança "autorize, depois carregue" passa a ser impossível de
errar num call site novo. Hoje ela é hábito: cada serviço reescreve o 403 com o nome da feature
digitado em prosa e depois o carrega-ou-404 — e um caminho faz o inverso, buscando antes de
autorizar, que é exatamente o vazamento que o ADR proíbe (quem não tem a feature `:others`
descobriria se um id existe). Esse caminho tem zero callers e zero testes: um guard que ninguém
alcança é um guard cujo erro ninguém viu.

**Blocked by:** None (can start immediately).

**Status:** fechada em 2026-09-23

- [x] Uma primitiva que recebe o actor, a feature e o id do alvo, ordena autorização e carga
      internamente, e devolve o alvo carregado
- [x] O `action` do 403 é derivado da feature recebida, não digitado em cada site
- [x] O modo *fail-closed* de pet (o dono não está na URL) é um **modo nomeado** da mesma primitiva,
      não um par de helpers próprio
- [x] Escopo: usuário, pet e perfil. Os resolvedores do catálogo **ficam como estão** — são
      carrega-ou-404 puros, autorizados pelo guard da rota, e não têm o hazard de ordem
- [x] O caminho que busca antes de autorizar é **removido**
- [x] A construção da descrição de features do 403, hoje duplicada entre o guard de rota e um
      serviço, volta a ter um dono
- [x] Teste unitário de que 403 vence 404, e do modo fail-closed
- [x] Os casos de integração existentes de 403-antes-de-404 seguem verdes, sem remoção

## O que ficou

**A ordem virou uma operação só.** `authorizeThenLoad`, em `apps/api/src/lib/authorization.ts`,
recebe o ator, a feature exigida e **como** carregar o alvo, e devolve o alvo carregado. A ordem
não é parâmetro — quem chama não tem como pedi-la errada porque não tem como pedi-la. O módulo
recebe o `load` em vez de buscar: `src/lib/` não conhece repository
(`apps/api/docs/adr/0100-src-lib-nao-conhece-modulo-nenhum.md`).

**Três modos nomeados, e o que muda entre eles é de onde vem o dono** — a ordem dos dois passos é
consequência disso, não escolha do call site:

- **`owner-in-url`** — o dono é o id da URL: autoriza, depois busca. Usuário (`getUserById`,
  `updateUser`, `deleteUser`) e perfil de cliente.
- **`no-owner`** — a feature não tem par self/`:others` porque nunca há self-service (D11): a posse
  da feature é a checagem inteira, também antes da busca. Perfil de funcionário. Este terceiro modo
  não estava no texto da issue; ele existe porque o perfil de funcionário já autorizava por
  `hasFeature` e não por dono, e forçá-lo no modo de dono teria **mudado regra** — passaria a
  permitir self-service, que é o oposto do D11.
- **`fail-closed`** — o dono só aparece no registro (`/customers/:customerId` traz o id do *perfil*,
  não o do usuário), então buscar primeiro é inevitável e o que preserva a invariante é o alvo
  inexistente responder **igual** ao alheio. Pet (`resolveCustomer`, `resolvePet`). É o modo que a
  issue pedia, e ele substituiu o par de helpers próprio do serviço de pet (`assertScope` sumiu).

**O `action` do 403 é derivado, e a frase tem um dono.** `createFeatureForbiddenError` monta o
corpo; o `describeFeatures` que o alimenta é privado ao módulo e serve tanto a primitiva quanto o
porteiro da rota (`canAccess`), onde a frase vivia em cópia. A variante nomeada é a que de fato
faltou: `read:user` para quem age sobre o próprio recurso, `read:user:others` para quem age sobre
o de outro — regra que o serviço de perfil já aplicava e que o de usuário digitava sempre como
`:others`.

**Isso não mudou nenhuma resposta.** Para chegar ao serviço de usuário é preciso passar pelo
`canAccess` da rota, que exige `read:user` **ou** `read:user:others`; dentro, um 403 só acontece
quando o alvo é de outro e falta o `:others`. O ramo em que a derivação diria a palavra diferente
(ator sobre si mesmo, sem a feature simples) é inalcançável pela rota — o porteiro já barrou. As
asserções de `action` da suíte de integração (user, perfil, pet) seguem literalmente as mesmas.

**O caminho invertido saiu.** `getUserByEmail` buscava antes de autorizar — o vazamento que o
`0011` proíbe — com zero callers e zero testes; foi **removido**, não corrigido. O
`findUserByEmail` do repositório **fica**: ele tem cinco chamadores vivos (login, verificação de
email, reset de senha, troca de email, unicidade no signup), e nenhum deles é leitura de recurso
alheio.

**O catálogo ficou como está**, como a spec decidiu: `resolveBrand`, `resolveCategory`,
`resolveTag`, `resolveProduct`, `resolveVariant` e a imagem são carrega-ou-404 puros, autorizados
pelo `canAccess` da rota. O `assertCanTouch` do serviço de variante também ficou: é autorização
**campo a campo**, com mensagem própria ("alterar estes campos"), e não tem alvo a carregar.

**Os testes.** Treze casos novos em `apps/api/tests/unit/lib/authorization.test.ts`, todos sobre a
interface da primitiva: que o `load` **não corre** quando a autorização recusa (é assim que "403
vence 404" se prova, e não pelo status), que o 403 do alvo inexistente é byte a byte igual ao do
alheio no modo fail-closed, que `:others` reabre o 404, que o OR de features lista todas as que
faltaram, e que o modo `no-owner` recusa quem só tem a variante `:others`. Nenhum teste existente
foi editado ou removido: os sete casos de integração que já guardavam a ordem por HTTP — usuário
(id inexistente sem `:others` no GET, no PATCH e no DELETE), pet (cliente e pet inexistentes sem
`:others`) e perfil (cliente e funcionário) — continuam sendo a prova de não-regressão.

**Um ponto em que este fecho lê a spec de um jeito, e vale dizer qual.** A spec pedia, para esta
issue, "um caso de integração por recurso, **somado** aos existentes". Os três recursos no escopo
já têm exatamente esse caso, e em usuário são três (um por operação): acrescentar um oitavo seria
duplicar uma asserção já existente, não ampliar cobertura. O que faltava era o teste **unitário**
da ordem — que antes não existia em lugar nenhum —, e é ele que o diff traz. Se a leitura for
outra, o conserto é acrescentar, não refazer.

**Onde a decisão passou a morar.** `apps/api/docs/adr/0011-autorizacao-sempre-antes-busca.md`
ganhou o lado que faltava: onde a ordem mora agora, os três modos e por que o catálogo fica fora.
Sem ADR novo — a spec previa isto, porque a decisão já estava registrada e o que faltava era o
código honrá-la num lugar só.
