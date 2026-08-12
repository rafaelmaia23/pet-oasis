# Autorização — RBAC, overrides e não-escalação

> O *porquê* do modelo de permissões. O modelo em si (invariantes, alternativas recusadas)
> está no ADR [`authorization-scope-and-lifecycle.md`](../adr/authorization-scope-and-lifecycle.md);
> as regras já firmadas, no `CLAUDE.md`.

---

## Ordem e forma da checagem

### Autorização sempre antes da busca

Se buscasse primeiro, alguém sem `:others` saberia se um id existe (404) ou não (sem erro) —
vaza existência. Checando `canActOnResource(user, feature, targetId)` antes, usando o id da
URL como `ownerId` e sem query, quem não tem `:others` recebe **403 igual** para id existente
ou inexistente.

### Autorização em duas etapas quando o ramo depende do banco

Na rota de perfil o `canAccess` ganhou a forma OR (`string[]`) e declara as **duas** features,
porque o ramo (criar × reativar) só é conhecido depois de ler o banco; o service reconfere a
específica do ramo que correu. Sem a segunda etapa, ter só `reactivate:` deixaria criar do
zero. A checagem vem antes da busca do usuário (403 vence 404), então é a **união** das duas
que abre a porta.

### Cômputo em dois laços, não um aninhado

`computeEffectiveFeatures` não mudou de assinatura na 8.0, mas passou a ser **dois laços**:
todas as features estáticas antes de qualquer override. Num laço só, um deny pendurado na
role A seria aplicado antes de a role B somar a feature, e o resultado dependeria da **ordem
das roles**.

---

## Não-escalação

### A âncora é a role admin, não a feature

Se o guard checasse a feature `manage:permission`, ela mesma poderia ser concedida por
override → escalação. A role `admin` é "dura" (vem de atribuição de role), por isso é a
âncora. Um attendant com `manage:permission` emprestada não é admin → não mexe em
`PRIVILEGED_FEATURES`.

### O guard vale para roles, não só para overrides

Atribuir ou revogar uma **role** pode conceder o mesmo poder que um override: `admin` carrega
o wildcard `"*"` e `manager` já carrega as próprias `PERMISSION_FEATURES`. Sem essa checagem,
um ator com `manage:permission` (sem a role `admin`) contornaria a proteção de overrides só
atribuindo `admin`/`manager` a si mesmo ou a outro. `assertAdminForRoleAssignment` usa a mesma
âncora, mas o gatilho muda: dispara quando a role concedida/revogada carrega alguma
`PERMISSION_FEATURES` **ou** o wildcard. Vale para conceder (POST) **e** revogar (DELETE) —
tirar a role `admin` de alguém é tão sensível quanto dá-la.

### Furo fechado na 8.3 — nascer com a role é ser atribuído a ela

`POST /users` aceitava `roleNames` e **nunca** rodava o guard: um manager criava uma conta já
com a role `admin`, desviando de `POST /users/:id/roles/:roleId`, que o exige.

### Nos três guards, o alvo é o mesmo conceito

`assertAdminForBan`, `assertAdminForPermissionFeature` e `assertAdminForRoleAssignment`
convergiram em `assertActorIsAdmin` (7.x). O guard da reativação é a exceção deliberada — ver
[lifecycle.md](lifecycle.md#o-guard-corre-sobre-as-roles-que-vão-voltar-k22).

---

## Escopo do override

### O override pendura na atribuição de role, não no usuário (D2)

Override é sobre a **função**, não sobre a pessoa. Escopo de usuário deixava um ajuste
concedido "pro trabalho de estoquista" sobreviver à perda da role de estoquista — e, pior, à
deleção do perfil inteiro de funcionário, virando vazamento de privilégio. Escopo de *perfil*
foi cogitado e recusado: grosso demais, não captura mudança de função dentro do mesmo perfil.

### Uma linha por `(userId, roleId)` para sempre (D3)

A unicidade saiu do código e foi para o banco. Isso exige **reuso de linha** na re-concessão
(`deletedAt = null`) em vez de linha nova, o que dá à `UserRole` uma **identidade estável** —
sem ela o FK do override ficaria órfão a cada ciclo de revogar/reconceder. O histórico de
ciclos não cabe mais na tabela e vive no audit log (D7): **tabela guarda estado, audit log
guarda história.**

### A role vai no path (D9)

A identidade do recurso é a tripla `(user, role, feature)` —
`PUT|DELETE /users/:userId/roles/:roleId/features/:featureId`. Body não identifica recurso:
quebraria a idempotência do `PUT`, e `DELETE` não tem semântica de body.

### 422 no `PUT` sem a role ativa, mas 404 no `DELETE`

Assimetria deliberada. No `PUT` a role é pré-condição da criação, então a validação semântica
nomeia o campo (`errors.roleId`) e orienta o caminho. No `DELETE` um único 404 cobre a tripla
inteira e **não revela** se o usuário tem aquela role.

### `DELETE` de override sem override ativo → 404, não 204

Decidido avisar em vez de devolver um sucesso vazio: o caller pediu para remover algo que não
existe, então é informado, não enganado. (`assertAdminForPermissionFeature` é reusado no `PUT`
e no `DELETE`.)

### Consequência na view

`userViews.admin` deixou de ter `features` no topo e passou a espelhar a junção
(`roles[].features[]`); `GET /users/:id/features` expõe a role de cada override;
`GET /users/:id/permissions` continua `string[]` plano.

---

## Vínculo user↔role

### Perfis vêm antes de user↔role

Atribuir role exige o perfil compatível já existir (a regra "sem perfil → crie primeiro, não
silencioso"). Se user↔role viesse antes, dependeria de algo inexistente.

### `POST` orienta, não cria perfil

Se `role.appliesTo` é incompatível com os perfis ativos → **422** cujo `action` orienta criar
o perfil primeiro. O endpoint **não** cria o perfil automaticamente: efeito colateral
silencioso é pior que um erro claro. Se o user já tem a role ativa → **409** (idempotência).

### `DELETE` protege o último vínculo do perfil

Se remover a role deixaria o perfil (customer/employee) sem nenhuma role ativa → **409**, com
`action` apontando para o `DELETE` do perfil, que é a via correta de encerrar o perfil inteiro.
Impede um user com perfil "órfão" sem role.

### Roles default na criação

Employee nasce com `attendant`, customer com `customer` (`DEFAULT_EMPLOYEE_ROLES` /
`DEFAULT_CUSTOMER_ROLES` em `user.service.ts`). Sem `roleNames` vale o default; com
`roleNames`, `validateRoles` valida `appliesTo` (incompatível → 422 com `errors`).

---

## Catálogo de features

### O nome diz o recurso (`create:customer-profile`, não `create:profile`)

O attendant precisa atender um cliente no balcão sem ganhar poder nenhum sobre perfil de
funcionário. Com um `create:profile:others` genérico gateando as duas rotas, dar a feature ao
attendant seria escalação; com o recurso no nome, `canActOnResource` ainda casa self e
`:others` sozinho, e quem lê `GET /features` não precisa adivinhar o alcance de cada uma.

### `reactivate:*` é feature separada de `create:*` (K12)

São poderes diferentes: criar faz o perfil nascer com as roles default; reativar traz de volta
as roles que aquele perfil tinha antes de morrer, incluindo as que um admin concedeu no
passado. Separadas, cada uma é concedível e revogável por override sem carregar a outra. Um
`manage:profile` genérico daria a quem só cadastra cliente no balcão o poder de ressuscitar um
conjunto de permissões que ele nem consegue enxergar.

### `create:`/`reactivate:customer-profile` moram em `SELF_MANAGEMENT_FEATURES`

A role `customer` morre exatamente quando o perfil de cliente é deletado. Se a feature de
reativar morasse nela, sumiria no instante em que passaria a ser necessária — o self-service
seria estruturalmente inalcançável. No baseline ela chega pela role de funcionário, que é
quem sobrou vivo.

### `read:audit-log:full` entrou em `PRIVILEGED_FEATURES`

Ela destrava o IP inteiro no audit log; o racional está em
[observability.md](observability.md#readaudit-logfull-e-não-uma-role-como-âncora).
`read:log`/`read:audit-log` continuam normais, concedíveis sem ser admin.
