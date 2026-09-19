# A restauração para na role (D6')

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

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
