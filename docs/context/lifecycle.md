# Ciclo de vida — soft delete, cascata, restauração e reativação

> A cascata de deleção desce quatro níveis; a restauração sobe dois. O modelo completo, com
> invariantes e alternativas recusadas, está no ADR
> [`authorization-scope-and-lifecycle.md`](../adr/authorization-scope-and-lifecycle.md).

---

## Soft delete

### Por que `UserFeature`/`UserRole` também têm soft delete

Decidido **por auditoria de segurança** — "quem podia o quê, quando". Sem esse requisito seria
hard delete, porque autorização não costuma precisar de histórico. A escolha trocou a PK
composta por `id` próprio (para permitir múltiplos registros do mesmo par: N deletados + 1
ativo). A unicidade do ativo nasceu controlada por código e **migrou para o banco na 8.0**
(`@@unique([userId, roleId])` com reuso de linha — ver
[authorization.md](authorization.md#uma-linha-por-userid-roleid-para-sempre-d3)).

### A cascata é escrita à mão, não pelo banco

`onDelete: Cascade` é ação referencial de *hard delete*: dispara no `DELETE` físico da linha
pai. Aqui o pai não é apagado (`UPDATE users SET deleted_at = ...`), e FK não propaga UPDATE de
coluna comum. O nativo seria **trigger**, recusada porque o Prisma não a gerencia (SQL cru numa
migration, fora do typecheck e dos testes) e porque não devolve as contagens que o audit
precisa. Nested write cobre parte (`roles: { updateMany: ... }`), mas `updateMany` só aceita
`where` + `data`: não desce até o **neto** (`UserFeature` via `UserRole`).

### Um único `new Date()` por transação (D4)

O timestamp é a chave de correlação da restauração. Mesma transação **não** garante mesmo
instante — quem gera é o JS, não o banco —, e `deleteCustomerProfile` chamava `new Date()` duas
vezes, o `softDelete` do user três. Se essa invariante vazar, o bug é **silencioso**: nada
quebra na deleção, só a restauração passa a não achar os filhos. Por isso existe teste dedicado
provando a igualdade nos quatro níveis, e nenhuma função de cascata pode chamar `new Date()`
internamente — o valor entra por parâmetro.

---

## Restauração

### Correlação por data, não por coluna de "motivo" (D5)

Foi cogitada uma `deletionScope` (`EXPLICIT`/`PROFILE`/`USER`) para tornar a linha
autoexplicativa, e recusada: suja a tabela sem ganho, porque a data já resolve o único caso
difícil — o admin religa um perfil e **escolhe não** trazer uma role; numa segunda
deleção/reativação, a rejeitada não pode voltar de carona. Com data resolve-se sozinho (perfil
morre em T2 com as roles A e B; admin religa só A; perfil morre de novo em T3, levando só A;
religar restaura onde `deletedAt == T3` → B, parada em T2, não bate mais).

### A restauração para na role (D6')

A cascata de deleção desce quatro níveis; a restauração sobe **dois**. A assimetria é
principiada: **deletar demais é fail-closed, restaurar demais é vazamento de privilégio** — as
duas direções têm perfil de risco oposto e por isso param em lugares diferentes. Some a isso
que override é ajuste fino e pontual: quem devolve um cargo frequentemente não sabe que havia
override pendurado nele, e ressuscitá-lo em silêncio é conceder permissão sem ninguém ter
decidido conceder. Override volta **só por `PUT` explícito** na tripla (que revive a linha
soft-deletada); a linha morta fica como evidência para o audit. Corroborado pelo mercado:
Azure/GCP/K8s RBAC não têm override por usuário, e o inline policy do AWS IAM é destrutivo na
remoção.

Isso **matou o D16** (guard de não-escalação sobre o conteúdo restaurado) e a ação de audit
`USER_PERMISSION_RESTORE_SKIPPED`: sem conteúdo dinâmico ressuscitando,
`assertAdminForRoleAssignment` — que lê as features **estáticas** da role — volta a bastar.
Custo assumido: quem tira e devolve um cargo refaz os ajustes à mão, com o audit log
(`USER_PERMISSION_GRANTED`/`_REVOKED`) dizendo o que havia.

### O nível `User` → perfil deixou de correlacionar (K20)

O D5 original mandava restaurar o perfil cujo `deletedAt` batesse com o da conta, e isso
produzia um beco sem saída: ex-cliente perde o perfil em T1, tem a conta deletada em T2, e ao
reativar não restaura (T1 ≠ T2) nem cria do zero (a linha existe) — terminando com conta ativa
e **zero** perfil ativo, contra o D14. A correlação existia para impedir carona; só que nesse
nível ninguém pega carona, porque **perfil nenhum volta sem ser nomeado** (o self-service nomeia
`CUSTOMER` e só; o admin nomeia a escolha dele). O corte mudou de lugar: *perfil volta porque
foi pedido; role volta porque correlaciona.*

### Os três níveis nasceram como primitivas de repositório (K7)

Só o nível de role tinha rota HTTP quando a mecânica foi escrita (8.2). Em vez de adiar perfil e
conta para as sub-fases que os expõem — o que desenharia a mesma mecânica três vezes —, os três
nasceram juntos em `user.lifecycle.repository.ts`, com os dois sem rota cobertos por teste de
integração chamando o repositório direto (`tests/integration/modules/user/user.lifecycle.test.ts`,
precedente de `tests/integration/scripts/` e `tests/integration/lib/seed/`). As sub-fases
seguintes só ligaram rota e ator, sem uma linha nova de mecânica.

### `grantRolesToUser` nasceu como primitiva

Em `user.lifecycle.repository.ts`, porque três caminhos precisam do reuso de linha do D3 e um
`create` cru estoura o `@@unique([userId, roleId])` sempre que já houve aquele par:
`addUserRole`, a criação de perfil e a reativação nomeando uma role morta fora daquela cascata.

---

## Perfil — os fluxos de produto

### A mesma rota cria e reativa (8.3)

O cliente não sabe — nem deveria precisar saber — se aquele usuário já teve o perfil algum dia.
Dois endpoints obrigariam a consultar o estado antes de escolher o verbo, e a resposta é **201
nos dois ramos** pelo mesmo motivo (mesmo idioma do K4, em que re-conceder uma role não revela o
reuso da linha). Quem ramifica é o service, lendo o banco.

**Isto substituiu a regra do Ciclo 1**, em que `POST` de perfil devolvia dois 409 distintos —
"já possui" para perfil ativo e uma mensagem diferente para perfil soft-deletado, porque não
havia recovery. O 409 de perfil **ativo** continua valendo; o de perfil morto virou o ramo de
reativação.

### `roleNames` é "com que roles o perfil volta", não filtro

Cada nome é **restaurado** (se morreu naquela cascata — `deletedAt` casa com o do perfil) ou
**concedido** (se morreu noutro instante ou nunca existiu). É a mesma semântica de criar, e é o
que faz a rota se comportar igual nos dois ramos. **Omitido, vale o default do D8:** voltam
todas as roles que morreram naquela cascata — o caminho comum ("devolve como estava") não obriga
ninguém a enumerar nada, e escolher um subconjunto continua possível. Uma semântica só no
projeto, no nível de perfil (K15) e no de conta (K21). Conceder role por aqui é conceder role,
então roda o mesmo `assertAdminForRoleAssignment` de `POST /users/:id/roles/:roleId`.

---

## Conta — deleção e reativação

### A reativação exige senha nova (K17)

A conta nunca volta com a credencial de antes da deleção — que pode ter sido justamente o motivo
dela. A rota de confirmação é pública e o **token é a credencial** (molde do `reset-password`),
então consumir o token também prova posse do email: por isso a confirmação já seta
`status = ACTIVE` e zera `mustChangePassword`, em vez de exigir um `verify-email` depois.

### O signup que dispara reativação responde 202 (K18)

Primeiro 202 do projeto, e ele diz exatamente o que houve: pedido aceito, **nenhum recurso
criado**, efeito fora da request (o email). 201 mentiria sobre criação e 200 seria menos
expressivo num POST sem corpo útil. O anti-enumeração continua: cpf que não bate, conta banida
(K24) e conta ativa (D12) devolvem o mesmo 409 genérico, indistinguíveis entre si.

### O admin não reativa nada sozinho

`POST /users/:id/reactivate` só emite o token e envia o email — quem conclui é o dono, na mesma
confirmação pública do self-service. Os dois caminhos convergem num ponto só, e a volta de uma
conta sempre passa por alguém que prova posse do email.

### O `phone` é pedido na confirmação, não no pedido (K23)

Ele só é necessário no ramo em que o perfil de cliente **nasce do zero** (conta que só tinha
funcionário), e nesse ramo falta um telefone obrigatório que ninguém tem além do próprio dono.
Pedi-lo na emissão do token exigiria uma coluna nova para carregá-lo até a confirmação; na
confirmação não custa nada, porque quem confirma é o dono. Ausente quando o ramo exige → 422 em
`errors.phone`. No ramo de restauração é opcional e **atualiza** o perfil restaurado — hoje é o
único caminho que grava `Customer.phone` depois da criação (`PATCH /users/:id` só aceita `name`).

### O guard corre sobre as roles que vão voltar (K22)

O molde `assertAdminForPrivilegedTarget` do ban/lock não serve aqui: ele lê as features
**efetivas** do alvo, e num alvo deletado todas as roles estão soft-deletadas — o conjunto sairia
vazio e o guard passaria sempre. O guard resolve o conjunto que de fato vai voltar (as nomeadas,
ou as que morreram na cascata) e roda `assertAdminForRoleAssignment` em cada uma, **antes de
qualquer escrita** — cobrindo os dois vetores (a conta *era* privilegiada / o ator *nomeou* uma
role privilegiada) sem conceito novo.
