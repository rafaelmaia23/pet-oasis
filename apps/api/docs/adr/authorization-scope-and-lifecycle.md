# Escopo do override e ciclo de vida de deleção/restauração

> Decisão de modelo registrada no redesenho da Fase 8 (2026-08-07) e refinada
> durante a execução — os pontos de virada estão datados no texto. Altera o
> schema, a autorização e o significado de deletar. É o tipo de decisão que se
> re-questiona daqui a um ano, por isso mora aqui e não só no `docs/context.md`.
>
> Contexto de execução: a Fase 8 foi implementada uma vez, revertida
> (`git reset` para `d1b8478`) e refeita. Este ADR descreve o modelo **correto**;
> a seção "Alternativas consideradas" registra o desenho revertido para que
> ninguém o reintroduza ao ler o histórico do git.

## O problema

Dois bugs pré-existentes, das Fases 4/5, que só apareceram quando se tentou
construir reativação de conta em cima deles.

### 1. Deletar usuário não cascateava

`softDeleteUserAndInvalidateSessions` marcava **só** `User.deletedAt` e
invalidava sessões. `Customer`, `Employee`, `UserRole` e `UserFeature` ficavam
intocados — um estado que o próprio modelo já considerava impossível, como
provava a mensagem de erro de `deleteCustomerProfile`, que recusa apagar o
último perfil ativo mandando o chamador deletar o usuário. Isso só faz sentido
se deletar o usuário levasse o perfil junto.

### 2. Override de feature não tinha escopo

`UserFeature` tinha `userId` + `featureId` e mais nada. Não apontava para role
nenhuma, e a deleção de perfil não o tocava. Consequência concreta:

> Funcionário é `attendant` + `estoquista`. O manager concede um override que
> serve ao trabalho de estoquista. O funcionário deixa de ser estoquista e o
> manager remove a role — mas o override sobrevive. Pior: deletar o **perfil de
> funcionário inteiro** também não o matava, então o ex-funcionário, agora só
> cliente, seguia com a permissão. `computeEffectiveFeatures` soma todo override
> vivo sem olhar perfil.

**É vazamento de privilégio**, e nenhum teste de comportamento pegava — o dado
inconsistente não quebra nada, só concede a mais.

Some-se a isso que a unicidade do vínculo ativo era garantida **por código**
("busca ativo → update ou create"), e que `deleteCustomerProfile` chamava
`new Date()` duas vezes na mesma transação, inviabilizando qualquer correlação
por data.

## Decisão ✅

### O override pendura na atribuição de role

`UserFeature.userId` → **`userRoleId`** (FK para `UserRole`), com
`@@unique([userRoleId, featureId])`. `User.features` deixa de existir como
relação: overrides são alcançados por `User.roles[].features[]`.

Override, no mundo real, é quase sempre sobre a **função** ("esse precisa de um
pouco mais pro trabalho que faz" / "esse, apesar do cargo, não pode X"), não
sobre a pessoa. Escopar ao **perfil** foi cogitado e recusado pelo
contra-exemplo do estoquista acima: perfil é grosso demais, não captura mudança
de função dentro do mesmo perfil.

Contexto de mercado: Azure RBAC, GCP IAM e Kubernetes RBAC **não têm** override
por usuário — quando o conjunto precisa ser diferente, cria-se uma *custom
role*. AWS IAM permite inline policy no usuário, mas trata como exceção. Aqui as
roles são read-only e definidas em código, então o `UserFeature` absorve toda a
pressão que nesses sistemas viraria custom role. Daí ele precisar de um ciclo de
vida que originalmente não tinha.

Consequência de contrato: a identidade do recurso é a tripla
`(user, role, feature)`, então a role vai no **path** —
`PUT | DELETE /users/:userId/roles/:roleId/features/:featureId`. Body não
identifica recurso: quebraria a idempotência do `PUT`, e o `DELETE` não tem
semântica de body.

### Uma linha por `(userId, roleId)`, para sempre

`@@unique([userId, roleId])` no banco. Re-conceder uma role **reusa** a linha
(`deletedAt = null`) em vez de criar outra.

Duas exigências pareciam conflitar aqui: unicidade no banco **e** histórico de
ciclos (concedido quando, revogado quando, re-concedido quando). Não cabem na
mesma tabela — uma linha só por par significa que o segundo ciclo sobrescreve a
data do primeiro. Resolve-se porque o histórico **já existe no audit log**
(`USER_ROLE_GRANTED`/`_REVOKED`): a tabela guarda **estado**, o audit log guarda
**história**.

E é isso que faz o escopo do override funcionar: com reuso de linha, `UserRole`
tem **identidade estável**, então o FK do override nunca fica órfão. Com linhas
append-only, cada re-concessão criaria uma linha nova e os overrides apontariam
para uma atribuição morta.

### A cascata desce quatro níveis, com um timestamp só

```
deletar User      →  User.deletedAt = T
                     └─ Customer.deletedAt = T  e  Employee.deletedAt = T
                        └─ UserRole.deletedAt = T
                           └─ UserFeature.deletedAt = T

deletar perfil    →  Customer|Employee.deletedAt = T
                     └─ UserRole.deletedAt = T   (as do appliesTo do perfil)
                        └─ UserFeature.deletedAt = T

revogar role      →  UserRole.deletedAt = T
                     └─ UserFeature.deletedAt = T

remover override  →  UserFeature.deletedAt = T
```

Nunca existe filho ativo de pai morto. A cascata **só toca linhas ativas**
(`deletedAt: null`) — o que já estava morto mantém o timestamp antigo, e é
exatamente isso que preserva a distinção na restauração.

O `T` é calculado **uma vez** no início da transação e propagado por parâmetro.
Mesma transação não garante mesmo instante: quem gera o valor é o JS, não o
banco. Precisão não é risco — o Prisma mapeia `DateTime` para `timestamp(3)` no
Postgres, e duas transações no mesmo usuário são sequenciais.

### A restauração sobe só dois, e correlaciona por data

```
reativar User    →  restaura os perfis NOMEADOS, tenham morrido quando tiverem
reativar perfil  →  restaura as UserRole onde userRole.deletedAt == perfil.deletedAt
reconceder role  →  restaura a linha da UserRole e MAIS NADA
```

**A assimetria é principiada, não descuido.** Deletar cascateia até o override
porque a invariante é "nunca filho ativo de pai morto" — errar para mais é
*fail-closed*. Restaurar **concede autoridade** — errar para mais é vazamento de
privilégio. As duas direções têm perfil de risco oposto, então param em lugares
diferentes.

Sobra **um** nível correlacionando por data (perfil → `UserRole`), que é
justamente onde ninguém nomeia nada. Acima dele, perfil volta por ser pedido;
abaixo, nenhum override ressuscita.

**Por que a data basta, sem coluna de "motivo".** O caso difícil é o admin
religar um perfil e **escolher não** trazer uma role: uma segunda
deleção/reativação não pode trazer de volta a rejeitada. Com `deletedAt`
resolve-se sozinho:

```
T2  perfil deletado          → roles A e B ficam com deletedAt = T2
    admin religa, escolhe A  → A.deletedAt = null;  B continua T2
T3  perfil deletado de novo  → A fica com deletedAt = T3;  B continua T2
    admin religa             → restaura onde deletedAt == T3  →  só A
                               B (T2) não bate mais, continua morta ✓
```

**Por que o override nunca ressuscita** (revogação do D6, Sessão C,
2026-08-10). A regra original dizia que re-conceder uma role restaurava os
overrides dela. Caiu contra um caso concreto: role R2 revogada em T1, perfil
morto em T2, admin reativa o perfil nomeando R2 — R2 revive, e os overrides
dela, mortos em T1, casariam com o `deletedAt` da própria R2 e voltariam junto,
sem ninguém ter pedido. Além do bug, o princípio: quem devolve um cargo a
alguém frequentemente não sabe que existiam overrides pendurados nele, e
ressuscitá-los em silêncio é conceder permissão sem ninguém ter decidido
conceder. O inline policy do AWS IAM — o análogo mais próximo no mercado — é
igualmente **destrutivo** na remoção.

**Por que o nível `User` → perfil deixou de correlacionar** (Sessão D,
2026-08-11). A regra "restaura o perfil cujo `deletedAt` bate com o da conta"
produzia um beco sem saída:

```
T1  perfil de cliente deletado            → customer.deletedAt = T1
T2  conta inteira deletada                → user.deletedAt = T2
    self-service (signup) reclama cliente → T1 ≠ T2, não restaura
                                          → e a linha existe, então criar do
                                            zero também não é possível
                                          → conta ativa com ZERO perfil ativo ✗
```

A correlação existia para impedir carona. Só que, na reativação de conta, perfil
nenhum volta sem ser **nomeado** (o self-service nomeia `CUSTOMER` e só; o admin
nomeia a escolha dele), então o risco que a regra cobria não existe nesse nível
— e o preço era um usuário sem caminho de volta. O corte mudou de lugar:
**perfil volta porque foi pedido; role volta porque correlaciona.**

## Invariantes de implementação (não negociáveis)

Se qualquer uma vazar, o bug é **silencioso** — nenhum teste de comportamento
pega:

1. **Um único `new Date()` por transação de deleção**, passado por parâmetro por
   toda a cascata. Nenhuma função de `user.lifecycle.repository.ts` pode chamar
   `new Date()` internamente. Tem teste dedicado provando a igualdade nos quatro
   níveis.
2. **Ler o `deletedAt` do pai antes de zerá-lo** na restauração — zerar primeiro
   perde a chave e transforma a restauração num no-op silencioso.
3. `computeEffectiveFeatures` **não muda de assinatura**: continua somando só o
   que está vivo. Toda a correção é de dados, não de cômputo. (Virou dois laços
   em vez de um aninhado, para que um deny da role A não seja aplicado antes de
   a role B somar a feature — isso é ordem, não escopo.)

## Consequências

- **A perda de um override é definitiva.** Morto pela cascata, mantém o
  `deletedAt` e não volta em nenhum ciclo futuro, para nenhum ator — só por
  concessão explícita via `PUT` na tripla, que revive a linha soft-deletada.
- **A perda é silenciosa na resposta, mas não no audit:** `cascadedOverrides` na
  metadata de `USER_ROLE_REVOKED`, `USER_PROFILE_DELETED` e `USER_DELETED` diz
  quantos ajustes finos foram embora. O par
  `USER_PERMISSION_GRANTED`/`_REVOKED` diz **quais** havia, então refazer é
  consulta + ação consciente — que é o ponto.
- **Contrapartida assumida:** funcionário sai de licença, role revogada, volta —
  e os ajustes finos precisam ser refeitos à mão. Aceito em troca de nunca
  conceder permissão por efeito colateral.
- **A não-escalação simplificou.** Uma `UserRole` restaurada carrega apenas as
  features **estáticas** da role, que é exatamente o que
  `assertAdminForRoleAssignment` já inspeciona — não foi preciso guard novo
  sobre conteúdo restaurado.
- **A cascata é escrita à mão**, em `src/modules/user/user.lifecycle.repository.ts`.

## Alternativas consideradas

- **Coluna `deletionScope` (`EXPLICIT`/`PROFILE`/`USER`)** para tornar a linha
  autoexplicativa: recusada. Suja a tabela sem ganho — a correlação por data já
  resolve o único caso difícil (ver o exemplo T2/T3 acima).
- **Escopar o override ao perfil** em vez de à `UserRole`: recusada pelo
  contra-exemplo do estoquista — não captura mudança de função dentro do mesmo
  perfil.
- **`UserRole` append-only** (linha nova a cada concessão), para ter o histórico
  na tabela: recusada. Deixaria o FK do override apontando para atribuições
  mortas a cada ciclo, e o histórico já vive no audit log.
- **`onDelete: Cascade` no banco:** não se aplica. É ação referencial de *hard
  delete*, dispara no `DELETE` físico da linha pai; aqui o pai só é atualizado
  (`UPDATE ... SET deleted_at`), e FK não propaga UPDATE de coluna comum.
- **Trigger no Postgres:** recusada por três motivos — o Prisma não gerencia
  trigger (viraria SQL cru numa migration, fora do typecheck e dos testes), ela
  não devolve as contagens que o audit precisa, e a restauração não caberia
  nela.
- **Nested write do Prisma** (`roles: { updateMany: ... }`): cobre um nível, mas
  `updateMany` só aceita `where` + `data` — não desce até o **neto**
  (`UserFeature` via `UserRole`). O mínimo real são 3 statements na mesma
  transação com o mesmo `T`.

### Do desenho revertido — não reintroduzir

A primeira implementação da Fase 8 leu o estado inconsistente ("perfil vivo sob
conta morta") como **informação** e construiu em cima. Com a cascata correta,
todo perfil de conta morta está morto e as três coisas abaixo perdem o
propósito:

- **`resolveProfileClaimAction`** (`RESTORE`/`CREATE`/`FREEZE`/`IGNORE` decidido
  a partir de "o perfil estava vivo no momento da deleção total").
- **`restoreCustomer`/`restoreEmployee` como `Boolean?` no `VerificationToken`**
  — o `null` significava "não é o caminho admin". A escolha do admin passou a
  ser `restoreProfiles ProfileKind[]` + `restoreRoleIds String[]`.
- **O guard "não congela o último perfil ativo"** na confirmação — existia
  porque o self-service podia ignorar o perfil reclamado; com "self-service só
  traz cliente" + "nunca há usuário ativo sem perfil ativo", o cenário é
  inalcançável.
- **A validação 422 "o perfil não estava ativo quando a conta foi excluída"** —
  o admin pode restaurar qualquer perfil que já existiu, e criar do zero o
  perfil de cliente que nunca existiu.

Efeito colateral concreto do desenho antigo, para memória: um usuário que perdeu
o perfil de cliente, depois teve a conta inteira deletada e depois reativou pelo
signup terminava com a conta ativa e o perfil de **funcionário** vivo — nunca o
de cliente que ele pediu.

## Quando revisitar

- **Se aparecer pressão por "restaurar os overrides junto":** o caminho não é
  reverter a assimetria, é uma ação explícita de "reaplicar os overrides do
  ciclo anterior", lendo o audit log e exigindo confirmação. Restaurar em
  silêncio continua fora.
- **Se as roles deixarem de ser read-only** (custom roles gerenciáveis por API):
  boa parte da pressão que hoje recai sobre `UserFeature` migraria para lá, e o
  escopo do override poderia ser reavaliado.
- **Quando a Fase 9 trouxer recursos com dono** (pets ligados a customers):
  confirmar que a cascata de deleção alcança o novo nível — a invariante "nunca
  filho ativo de pai morto" vale para o domínio inteiro, não só para
  autorização.
