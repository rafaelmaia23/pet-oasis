# Fase 8 — Redesenho (documento de trabalho)

> **Status:** em execução. Sessões A e B fechadas (8.0–8.2); Sessão C fechada (Passo 0 + 8.3),
> que **revogou o D6** — ver §3.4. Faltam as Sessões D–G (8.4–8.9).
> **Natureza:** documento temporário de trabalho. Não é ADR nem doc permanente — o
> conteúdo daqui se dissolve em `docs/todo.md`, `docs/context.md` e ADRs conforme
> as sub-fases forem executadas.
> **Data do desenho:** 2026-08-07.
>
> Nasceu untracked para sobreviver ao `git reset --hard` do passo 4 (revert da
> Fase 8 antiga). Com o revert feito, passou a ser versionado na branch `fase-8`.
> O backup da implementação antiga continua **fora do git**: branch local
> `backup/fase-8-original` e patches em `.fase-8-backup/` (gitignored).

---

## 1. Por que este documento existe

A Fase 8 foi implementada e mergeada na `main` (commits `5e31e08`..`634e41a`), mas
o desenho em que ela se apoiava estava conceitualmente errado. O erro não foi de
implementação — os testes passam, o código faz o que foi pedido. O erro foi de
**modelo**: a fase construiu uma máquina de reativação em cima de dois bugs
pré-existentes, e boa parte da complexidade dela existe só para contornar esses
bugs.

A decisão foi **reverter o código da Fase 8 e refazê-la**, em vez de corrigir por
cima. Motivo: o grosso do que existe hoje (a função `resolveProfileClaimAction`, as
colunas `restoreCustomer`/`restoreEmployee`, o guard do invariante "≥1 perfil") são
soluções para problemas que deixam de existir no desenho correto. Corrigir por cima
deixaria o histórico cheio de features que nunca deveriam ter sido escritas.

---

## 2. Diagnóstico — o que estava errado

### 2.1 `deleteUser` não cascateia (bug pré-existente, era da Fase 4/7)

`softDeleteUserAndInvalidateSessions` (`user.repository.ts`) marca **só**
`User.deletedAt` e invalida sessões. `Customer`, `Employee`, `UserRole` e
`UserFeature` ficam intocados.

Isso produz um estado que não deveria existir: **perfil ativo sob usuário morto**.
Que o modelo já considerava impossível está provado pela mensagem de erro de
`deleteCustomerProfile`/`deleteEmployeeProfile`, que recusa apagar o último perfil
ativo mandando o chamador deletar o usuário — só faz sentido se a deleção do
usuário levasse o perfil junto.

### 2.2 Override de feature não tem escopo (bug pré-existente, era da Fase 5)

`UserFeature` tem `userId` + `featureId` e mais nada. Não tem `appliesTo` (como
`Role` tem), não aponta para role nenhuma. E a deleção de perfil **não toca** em
`UserFeature`.

Consequência: um override concedido a um funcionário sobrevive à deleção do perfil
de funcionário. O ex-funcionário, agora só cliente, continua com a feature
concedida — `computeEffectiveFeatures` soma todo override com `deletedAt: null`,
sem olhar perfil. **É um vazamento de privilégio.**

### 2.3 Reativação restaura roles sem critério

`reactivateCustomerProfile`/`reactivateEmployeeProfile` religam `UserRole` com
`deletedAt: { not: null }` — **todas** as soft-deletadas daquele `appliesTo`, sem
distinguir "morreu na cascata do perfil" de "foi revogada de propósito meses
antes". Uma role deliberadamente removida ressuscita na reativação.

### 2.4 `UserRole` não tem unicidade no banco

A unicidade do vínculo ativo é controlada **por código** ("busca ativo → update ou
create"). Invariante de dados garantida fora do banco é invariante que uma race
condition ou um script de manutenção quebra.

### 2.5 `new Date()` múltiplo na mesma transação

`deleteCustomerProfile` chama `new Date()` duas vezes (perfil e roles). Mesma
transação não garante mesmo timestamp — quem gera é o JS, não o banco. Isso
inviabiliza qualquer correlação por data.

### 2.6 A Fase 8 herdou tudo isso

Como 2.1 não cascateava, o estado de `Customer`/`Employee` continuava "vivo" sob
uma conta morta. A Fase 8 leu isso como *informação* ("este perfil estava vivo no
momento da deleção total") e construiu em cima:

- `resolveProfileClaimAction` decide `RESTORE`/`CREATE`/`FREEZE`/`IGNORE` a partir
  desse estado;
- `forceAccountReactivation` valida (422) se o perfil pedido "estava vivo";
- um guard extra impede que a confirmação deixe a conta sem perfil ativo.

Com a cascata correta, **todo perfil de conta morta está morto** — a distinção
some, e as três coisas acima viram código sem propósito. Efeito colateral concreto
do desenho antigo: um usuário que perdeu o perfil de cliente, depois teve a conta
inteira deletada, e depois reativa pelo signup, termina com a conta ativa e o
perfil de **funcionário** vivo — nunca o de cliente que ele pediu.

---

## 3. Decisões firmadas

| # | Decisão | Escolha |
|---|---|---|
| **D1** | Cascata de deleção | Total e sempre: `User` → perfis → `UserRole` → `UserFeature`. Nunca existe filho ativo de pai morto. |
| **D2** | Escopo do override | `UserFeature` ganha FK para `UserRole`. Todo override pertence a uma atribuição de role — não ao usuário solto. |
| **D3** | Unicidade de `UserRole` | `@@unique([userId, roleId])` no banco. **Uma linha por par, para sempre.** Re-conceder reusa a linha (`deletedAt = null`). |
| **D4** | Correlação de restauração | Por `deletedAt`, com **um único timestamp por transação** propagado por toda a cascata. Sem coluna de "motivo". |
| **D5** | Regra de restauração | Restaura o filho cujo `deletedAt` é **igual** ao do pai. Vale nos dois níveis que a restauração alcança (`User` → perfil → `UserRole`); o terceiro saiu com o D6' — ver §3.4. |
| **D6** | ~~Re-conceder role restaura os overrides~~ | **REVOGADA no kickoff da Sessão C (2026-08-10).** Substituída por **D6'**: a cascata de deleção desce quatro níveis, mas a **restauração sobe só dois** (`User` → perfil → `UserRole`). Override **nunca** ressuscita por efeito colateral — só por ação explícita (`PUT /users/:id/roles/:roleId/features/:featureId`, que já revive a linha soft-deletada). Ver §3.4. |
| **D7** | Histórico de ciclos | Vive no audit log (`USER_ROLE_GRANTED`/`USER_ROLE_REVOKED`/`USER_PERMISSION_GRANTED`/`USER_PERMISSION_REVOKED`, já existentes), não na tabela. |
| **D8** | Escolha de roles ao religar | **Default: traz todas** as que morreram na cascata. O admin pode escolher um subconjunto e ignorar o resto. |
| **D9** | Contrato do override | `PUT \| DELETE /users/:userId/roles/:roleId/features/:featureId`. A role vai no path, nunca no body. |
| **D10** | Migration | **Zera o banco.** App só tem demo de portfólio no ar; sem dado real a preservar. |
| **D11** | Self-service nunca traz funcionário | Reativação pelo signup traz (ou cria) **apenas** o perfil de cliente. Perfil de funcionário só volta por ação de admin. |
| **D12** | Signup não faz account-linking | Email/cpf de conta **ativa** → signup recusa e orienta a logar. Nunca mexe numa conta viva (cpf não é segredo). Herdada da Fase 8 antiga (N12), continua válida. |
| **D13** | Emails | Só o **email atual** de uma conta é reservado (inclusive de conta deletada). Email já trocado fica livre para reuso; `PreviousEmail` é só auditoria e nunca bloqueia. |
| **D14** | Invariante central | **Nunca** existe usuário ativo sem ao menos um perfil ativo. Vale em todos os fluxos, sem exceção. |
| **D15** | Mensagem de erro | `"Para excluir esse perfil use o endpoint de deleção de usuário."` (hoje diz "esse usuario", invertendo o sujeito). |
| **D16** | ~~Não-escalação na restauração~~ | **MORTA junto com o D6 (Sessão C).** Existia só para tornar o D6 seguro: se nenhum override ressuscita, não há conteúdo dinâmico para filtrar, e `assertAdminForRoleAssignment` — que inspeciona as features **estáticas** da role — volta a bastar sozinha. Removida no Passo 0 da Sessão C. |

### 3.1 Por que `deletedAt` e não uma coluna de motivo

Foi cogitada uma coluna `deletionScope` (`EXPLICIT`/`PROFILE`/`USER`) para tornar a
linha autoexplicativa. Recusada: mantém a tabela mais suja sem ganho real, porque a
correlação por data **já resolve** o único caso difícil.

O caso difícil é: o admin religa um perfil e **escolhe não** trazer uma role. Sem
correlação, uma segunda deleção/reativação traria de volta a role rejeitada. Com
data, resolve-se sozinho:

```
T2  perfil deletado          → roles A e B ficam com deletedAt = T2
    admin religa, escolhe A  → A.deletedAt = null;  B continua T2
T3  perfil deletado de novo  → A ficam com deletedAt = T3;  B continua T2
    admin religa             → restaura onde deletedAt == T3  →  só A
                               B (T2) não bate mais, continua morta ✓
```

Nenhuma regra extra necessária.

### 3.2 Por que o override aponta para `UserRole` e não para o perfil

Escopar o override ao **perfil** foi cogitado e recusado por um contra-exemplo:

> Funcionário é `attendant` + `estoquista`. O manager concede um override que serve
> ao trabalho de estoquista. Depois o funcionário deixa de ser estoquista e o
> manager remove a role. Com escopo de perfil, o perfil de funcionário continua
> ativo — então o override sobrevive, num funcionário que agora é só atendente.

Escopo de perfil é grosso demais: não captura mudança de função. Override, no mundo
real, quase sempre é sobre a **função** ("esse precisa de um pouco mais pro trabalho
que faz" / "esse, apesar do cargo, não pode X"), não sobre a pessoa.

Contexto de mercado: Azure RBAC, GCP IAM e Kubernetes RBAC **não têm** override por
usuário — quando o conjunto precisa ser diferente, cria-se uma *custom role*. AWS
IAM permite inline policy no usuário mas trata como exceção. Aqui as roles são
read-only e definidas em código, então o `UserFeature` absorve toda a pressão que
nesses sistemas viraria custom role. Daí ele precisar de um ciclo de vida que
originalmente não tinha.

### 3.3 Por que uma linha por `(userId, roleId)` com reuso

Duas exigências pareciam conflitar: unicidade no banco **e** histórico de ciclos
(concedido quando, revogado quando, re-concedido quando). Não cabem na mesma
tabela — uma linha só por par significa que o segundo ciclo sobrescreve a data do
primeiro.

Resolve-se porque o histórico **já existe no audit log**. Então a tabela guarda
estado (a última revogação), o audit log guarda história. Cada um no seu lugar.

E é isso que faz D2 funcionar: com reuso de linha, `UserRole` tem **identidade
estável**, então o FK do override nunca fica órfão — a role volta e a linha é a
mesma. Com linhas append-only, cada re-concessão criaria uma linha nova e os
overrides apontariam para uma atribuição morta.

### 3.4 Por que o D6 foi revogado (Sessão C, 2026-08-10)

O D6 dizia que re-conceder uma role restaura os overrides dela. Caiu ao ser
testado contra um caso concreto do fluxo de perfil: role R2 revogada em T1, perfil
morto em T2, e o admin reativa o perfil nomeando R2. R2 revive — e os overrides
dela, mortos em T1, casariam com o `deletedAt` da própria R2 e voltariam junto,
sem que ninguém tivesse pedido.

**A assimetria é principiada, não descuido.** Deletar cascateia até o override
porque a invariante é "nunca filho ativo de pai morto" — errar para mais é
*fail-closed*. Restaurar **concede autoridade** — errar para mais é vazamento de
privilégio. As duas direções têm perfil de risco oposto, então param em lugares
diferentes:

```
deletar   →  User → perfil → UserRole → UserFeature      (quatro níveis)
restaurar →  User → perfil → UserRole                    (dois níveis)
```

Some a isso que override é ajuste fino e pontual: quem devolve um cargo a alguém
frequentemente não sabe que existiam overrides pendurados nele, e ressuscitá-los
em silêncio é conceder permissão sem ninguém ter decidido conceder. Override
passa a ser sempre **ação ativa e consciente**.

Contexto de mercado, coerente com §3.2: Azure RBAC, GCP IAM e Kubernetes RBAC não
têm override por usuário; o inline policy do AWS IAM, que é o análogo mais
próximo, é **destrutivo** na remoção — reanexar uma managed policy depois não
ressuscita a inline apagada.

**Contrapartida registrada:** o racional original do D6 era real — funcionário sai
de licença, role revogada, volta, e os ajustes finos precisam ser refeitos à mão.
Fica aceitável porque o histórico mora no audit log (D7): `USER_PERMISSION_GRANTED`
/ `_REVOKED` dizem exatamente o que havia, e refazer vira consulta + ação
consciente, que é justamente o ponto.

**Consequência em cascata:** o D16 morre junto (§9.1 idem). Toda a máquina de
não-escalação-na-restauração existia só para tornar o D6 seguro; sem overrides
ressuscitando, uma `UserRole` restaurada carrega apenas as features **estáticas**
da role, que é exatamente o que `assertAdminForRoleAssignment` já inspeciona. A
linha do override continua soft-deletada — é evidência para o audit; ela apenas
nunca volta sozinha.

---

## 4. Modelo corrigido

### 4.1 Mudanças de schema

```prisma
model UserRole {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  roleId    String    @map("role_id")
  grantedAt DateTime  @default(now()) @map("granted_at")   // NOVO (não existia)
  deletedAt DateTime? @map("deleted_at")

  user     User          @relation(...)
  role     Role          @relation(...)
  features UserFeature[]                                    // NOVO

  @@unique([userId, roleId])                                // NOVO
  @@map("user_roles")
}

model UserFeature {
  id         String    @id @default(uuid())
  userRoleId String    @map("user_role_id")                 // NOVO (substitui userId)
  featureId  String    @map("feature_id")
  granted    Boolean   @default(true)
  grantedAt  DateTime  @default(now()) @map("granted_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  userRole UserRole @relation(...)                          // NOVO
  feature  Feature  @relation(...)

  @@unique([userRoleId, featureId])                         // NOVO
  @@map("user_features")
}
```

`User.features` deixa de existir como relação direta — os overrides passam a ser
alcançados via `User.roles[].features[]`.

### 4.2 Cascata de deleção

Um `deletedAt` único, calculado uma vez no início da transação e propagado:

```
deletar User      →  User.deletedAt = T
                     └─ Customer.deletedAt = T  e  Employee.deletedAt = T   (os ativos)
                        └─ UserRole.deletedAt = T   (as ativas do appliesTo do perfil)
                           └─ UserFeature.deletedAt = T   (as ativas daquela UserRole)

deletar perfil    →  Customer|Employee.deletedAt = T
                     └─ UserRole.deletedAt = T      (as ativas daquele appliesTo)
                        └─ UserFeature.deletedAt = T

revogar role      →  UserRole.deletedAt = T
                     └─ UserFeature.deletedAt = T   (as ativas daquela UserRole)

remover override  →  UserFeature.deletedAt = T
```

A cascata **só toca linhas ativas** (`deletedAt: null`). O que já estava morto
mantém o timestamp antigo — e é exatamente isso que preserva a distinção na
restauração.

### 4.3 Restauração (D5)

```
reativar User    →  restaura perfis    onde perfil.deletedAt     == user.deletedAt
reativar perfil  →  restaura UserRoles onde userRole.deletedAt   == perfil.deletedAt
reconceder role  →  restaura a linha da UserRole e MAIS NADA          (D6', §3.4)
```

A correlação por data vale nos **dois** níveis que a restauração alcança. O
terceiro nível saiu com o D6: nenhum override ressuscita, nem o que morreu junto
com o pai — só volta por `PUT /users/:id/roles/:roleId/features/:featureId`, que
revive a linha soft-deletada explicitamente.

### 4.4 Invariantes de implementação (não negociáveis)

Se qualquer uma vazar, o bug é **silencioso** — nenhum teste de comportamento pega:

1. **Um único `new Date()` por transação de deleção**, passado como parâmetro por
   toda a cascata. Nenhuma função de repositório de cascata pode chamar `new Date()`
   internamente. Merece teste dedicado provando a igualdade nos quatro níveis.
2. **Ler o `deletedAt` do pai antes de zerá-lo** na reativação — senão a comparação
   dos filhos perde a chave.
3. `computeEffectiveFeatures` **não muda de assinatura**: continua somando só o que
   está vivo. Toda a correção é de dados, não de cômputo.

Precisão não é risco: Prisma mapeia `DateTime` para `timestamp(3)` no Postgres
(milissegundo), e duas transações no mesmo usuário são sequenciais.

---

## 5. Estados e caminhos

### 5.1 Usuário ATIVO

Todo usuário ativo tem ≥1 perfil ativo (D14), então há exatamente dois estados
possíveis, cada um com duas variantes (o outro perfil nunca existiu, ou existiu e
está soft-deleted).

| Estado | O outro perfil | Quem pode agir | Rota |
|---|---|---|---|
| Cliente ativo | Funcionário nunca existiu | **Só admin/manager** — cria | `POST /users/:userId/employee` |
| Cliente ativo | Funcionário soft-deleted | **Só admin/manager** — reativa | `POST /users/:userId/employee` (detecta e reativa) |
| Funcionário ativo | Cliente nunca existiu | **O próprio, sempre** + admin/manager/attendant — cria | `POST /users/:userId/customer` |
| Funcionário ativo | Cliente soft-deleted | **O próprio, sempre** + admin/manager/attendant — reativa | `POST /users/:userId/customer` (detecta e reativa) |

Regras:

- **Nunca há self-service para virar funcionário** — nem criar, nem reativar.
- **Sempre há self-service para virar cliente** — criar ou reativar, indistintamente.
- A rota é **a mesma** para criar e para reativar; o service ramifica pelo estado do
  perfil no banco.
- `POST /auth/signup` nesses casos **recusa e orienta a logar** (D12). Não cria, não
  vincula, não muda nada.
- ✅ **Divergência resolvida no kickoff da Sessão C (Q1 → K11/K13).** O catálogo passa
  a nomear o recurso: `create:customer-profile` / `reactivate:customer-profile` (self,
  no baseline) + o par `:others` (attendant, manager, admin) + `create:employee-profile`
  / `reactivate:employee-profile` (só manager/admin). É o que deixa o attendant ajudar
  o cliente no balcão sem ganhar poder nenhum sobre perfil de funcionário.

### 5.2 Usuário DELETADO

Com a cascata (D1), um usuário deletado tem **todos** os perfis e roles mortos. Os
três casos abaixo se distinguem pelo que *existia* no momento da deleção.

#### Caso A — só teve perfil de cliente

| Caminho | Resultado |
|---|---|
| Self-service (signup) | Conta ativa + perfil de cliente restaurado (roles e overrides que morreram na cascata voltam) |
| Admin | Idem |

#### Caso B — só teve perfil de funcionário

| Caminho | Resultado |
|---|---|
| Self-service (signup) | Conta ativa + perfil de cliente **criado do zero** (nunca existiu). Funcionário **continua morto** (D11) |
| Admin — só cliente | Conta ativa + perfil de cliente criado do zero |
| Admin — só funcionário | Conta ativa + perfil de funcionário restaurado |
| Admin — ambos | Funcionário restaurado + cliente criado do zero |

#### Caso C — teve os dois perfis

| Caminho | Resultado |
|---|---|
| Self-service (signup) | Conta ativa + cliente restaurado. Funcionário **continua morto** (D11) |
| Admin — só cliente | Conta ativa + cliente restaurado |
| Admin — só funcionário | Conta ativa + funcionário restaurado |
| Admin — ambos | Os dois restaurados |

Em **todos** os caminhos de conta deletada: a reativação nunca pode resultar em
conta ativa sem perfil ativo (D14), e o schema recusa escolher zero perfis.

### 5.3 Emails (D13)

| Situação | Comportamento |
|---|---|
| Email atual de conta **ativa** | Reservado. Signup → 409 |
| Email atual de conta **soft-deleted** | Reservado. Signup com o cpf batendo → dispara reativação; cpf não batendo → 409 genérico (não revela que a conta existe) |
| Email **já trocado** (em `PreviousEmail`) | **Livre** para reuso por qualquer conta. `PreviousEmail` é só registro de auditoria ("este email pertenceu à conta Y até a data X") e nunca bloqueia |

`User.email` tem `@unique` global simples, que já reserva o email de conta deletada
a nível de banco — nenhuma mudança de schema necessária aqui.

---

## 6. Contratos de API

| Rota | Mudança |
|---|---|
| `PUT /users/:userId/roles/:roleId/features/:featureId` | **Substitui** `PUT /users/:userId/features/:featureId`. Body `{ granted }` (D9) |
| `DELETE /users/:userId/roles/:roleId/features/:featureId` | **Substitui** `DELETE /users/:userId/features/:featureId` |
| `GET /users/:userId/permissions` | Presenter passa a expor a role de cada override |
| `POST /users/:userId/customer` | Cria **ou** reativa; self + admin/manager/attendant |
| `POST /users/:userId/employee` | Cria **ou** reativa; só admin/manager |
| `DELETE /users/:userId/{customer,employee}` | Cascata para roles e overrides; mensagem do último perfil corrigida (D15) |
| `DELETE /users/:userId` | Passa a cascatear (D1) |
| `POST /auth/signup` | Detecta conta deletada e dispara reativação; recusa e orienta a logar quando a conta está ativa |
| Reativação de conta (admin) | Escolhe perfis **e** roles (D8) |
| Confirmação de reativação | Público, token como credencial, senha nova |

---

## 7. O que se aproveita da Fase 8 antiga

| Sub-fase | Situação |
|---|---|
| **8.8** — isenção do demo no lockout | ✅ **Aproveita integralmente.** Não tem nada a ver com usuário/perfil; é bug de produção independente (role `demo` isenta do account lockout, mantendo rate limit por IP). Reaplicar como está |
| **8.6** — emails liberados | ✅ Conceito correto (= D13). A implementação (remover os 3 call sites de `findPreviousEmailByEmail` e apagar `assertEmailAvailable`) continua válida |
| **8.7** — rate limit / anti-enumeração | 🟡 A infra é boa e reaproveitável: `AppError.headers` + `Retry-After` aplicado pelo error handler, e `consumeEmailTargetLimit` chamável do service. Os call sites dependem dos fluxos novos |
| **8.0** — fundação | 🟡 Parcial: `VerificationPurpose.ACCOUNT_REACTIVATION` e as audit actions continuam necessárias. As colunas `restoreCustomer`/`restoreEmployee` mudam de forma (viram escolha de perfis **e** roles, D8) |
| **8.1 / 8.2** — perfil em conta viva | ✅ **Consumido na 8.3 (Sessão C).** Aproveitados o desenho de rota (uma rota, dois ramos) e a forma OR do `canAccess`. O catálogo de features foi **refeito**, não reaproveitado: passou a nomear o recurso (`create:customer-profile`) para o attendant poder atender o cliente sem alcançar perfil de funcionário (K11/K13) |
| **8.3 / 8.4 / 8.5** — conta inteira | ❌ **Refazer.** `resolveProfileClaimAction`, a validação 422 de "perfil estava vivo" e o guard do invariante deixam de ter propósito |

---

## 8. Plano de execução

| # | Passo | Detalhe |
|---|---|---|
| 1 | Doc de desenho | Este arquivo |
| 2 | Backup da Fase 9 | Só o commit `1723b75` (`docs: expand Fase 9 into atomic tasks`), que mexe **apenas** em `docs/todo.md`. Sem código |
| 3 | Backup do que se salva da Fase 8 | Conforme §7 — principalmente 8.8, e a infra de rate limit da 8.7 |
| 4 | Reverter | Alvo: **`d1b8478`** (`merge: seed de dados fake`), último commit antes do planejamento da Fase 8. **Não** `d411d30` (merge da Fase 7) — isso jogaria fora o seed de dados fake, que não é da Fase 8 |
| 5 | Reescrever a Fase 8 no `docs/todo.md` | Ordem em §8.1 |
| 6 | Executar | TDD, uma branch por sub-fase, conforme o fluxo do CLAUDE.md |
| 7 | Restaurar a Fase 9 | Reaplicar o backup do passo 2 |

### 8.1 Ordem das sub-fases

A ordem é forçada por dependência: nada de reativação funciona antes do modelo de
dados estar correto.

| Sub-fase | Tema | Por que aqui |
|---|---|---|
| **8.0** | Escopo de override + unicidade de `UserRole` | Fundação. Migration, `UserFeature.userRoleId`, `@@unique`, cascata de revogação de role, contrato novo do endpoint (D9). Nada de reativação depende de mais nada antes disso |
| **8.1** | Cascata de deleção + timestamp único | `deleteUser` cascateia (D1); todas as cascatas passam a propagar um `deletedAt` só (D4); mensagem corrigida (D15) |
| **8.2** | Restauração por correlação de data | A regra de §4.3. Escrita nos três níveis; o terceiro (re-conceder role trazendo overrides) foi **desfeito** no Passo 0 da Sessão C, com a revogação do D6 (§3.4) |
| **8.3** | Perfil em conta ativa | §5.1 — as quatro linhas da tabela |
| **8.4** | Conta deletada — self-service (signup) | §5.2, coluna self-service dos casos A/B/C |
| **8.5** | Conta deletada — admin | §5.2, colunas de admin; escolha de perfis e roles (D8) |
| **8.6** | Emails liberados | Independente; reaplica o conceito da 8.6 antiga (D13) |
| **8.7** | Rate limit / anti-enumeração | Cobre as superfícies novas de 8.4/8.5 |
| **8.8** | Isenção do demo no lockout | Reaplica integralmente a 8.8 antiga |
| **8.9** | Fechos | Docs, `typecheck`, `lint`, suíte |

---

## 9. Questões em aberto

Resolver no kickoff da sub-fase correspondente — **não decidir na implementação**.

| # | Questão | Onde |
|---|---|---|
| ~~Q1~~ | ~~`attendant` cria/reativa o perfil de cliente de outra pessoa?~~ **Sim** — com um par de features escopado ao cliente (K11/K13, §5.1) | ✅ 8.3 |
| ~~Q2~~ | ~~Continuam existindo features `reactivate:*` separadas das `create:*`?~~ **Sim, separadas** (K12): reativar traz roles antigas de volta, criar nasce com o default — poderes diferentes, concedíveis em separado | ✅ 8.3 |
| Q3 | Reativação de conta continua exigindo senha nova? (era N6 da fase antiga) | 8.4 |
| Q4 | Signup que detecta conta deletada continua respondendo 202? (era decisão de kickoff da 8.3 antiga) | 8.4 |
| Q5 | O endpoint de reativação por admin continua sendo `POST /users/:id/reactivate`? | 8.5 |
| Q6 | Guard de não-escalação para alvo que **era** privilegiado continua exigindo ator admin? (era decisão de kickoff da 8.4 antiga) | 8.5 |
| Q7 | Como o admin nomeia as roles a restaurar — ids no body, ou default implícito com lista de exclusão? | 8.5 |
| ~~Q8~~ | ~~Overrides restaurados precisam de checagem de não-escalação?~~ **Dissolvida:** nenhum override é restaurado (D6', §3.4) | — |
| ~~Q9~~ | ~~Quem é o "ator" na confirmação de reativação de conta, se a rota é pública?~~ **Dissolvida junto com o D16.** Não há autoridade a capturar em tempo de emissão do token, porque a confirmação não decide sobre conteúdo privilegiado — ela restaura perfis e roles, e roles são governadas por `assertAdminForRoleAssignment` no momento em que o admin as nomeia | — |

### 9.1 ~~Consequências de D16~~ — o que sobrou depois do D6'

Com a restauração parando na role (§3.4), as três consequências que esta seção
listava se resolvem sozinhas: o descarte deixa de ser um caso especial do override
privilegiado e vira a regra geral para **todo** override. O que continua valendo, e
merece estar escrito:

1. **A perda é definitiva.** Um override morto pela cascata mantém o `deletedAt` e
   não volta em nenhum ciclo futuro, para nenhum ator. Só por concessão explícita.
2. **A perda é silenciosa na resposta**, mas não no audit: o `cascadedOverrides` na
   metadata de `USER_ROLE_REVOKED` (K6), `USER_PROFILE_DELETED` e `USER_DELETED`
   (K8) é o rastro de quantos ajustes finos foram embora.

---

## 10. Decisões da Fase 8 antiga que **não** sobrevivem

Registradas para não serem reintroduzidas por engano ao ler o `docs/todo.md` antigo:

- **N4 / `resolveProfileClaimAction`** — a distinção "o perfil estava vivo no momento
  da deleção total" deixa de existir: com cascata, todo perfil de conta morta está
  morto.
- **`restoreCustomer`/`restoreEmployee` como `Boolean?` no `VerificationToken`** — o
  `null` significava "não é o caminho admin". Some junto com a distinção acima; a
  escolha do admin passa a incluir roles (D8).
- **O guard "não congela o último perfil ativo"** (`confirmAccountReactivation`) —
  existia porque o self-service podia ignorar o perfil reclamado. Com D11 + D14, o
  cenário é inalcançável.
- **A validação 422 "o perfil não estava ativo quando a conta foi excluída"**
  (`forceAccountReactivation`) — o admin passa a poder restaurar qualquer perfil que
  já existiu, e a criar do zero o que nunca existiu (§5.2, Caso B).
- **N8 dizia "signup"**, mas a liberação de email vale para todos os caminhos —
  mantido e generalizado em D13.
