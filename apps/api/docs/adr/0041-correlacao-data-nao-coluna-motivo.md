# Correlação por data, não por coluna de "motivo" (D5)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Foi cogitada uma `deletionScope` (`EXPLICIT`/`PROFILE`/`USER`) para tornar a linha
autoexplicativa, e recusada: suja a tabela sem ganho, porque a data já resolve o único caso
difícil — o admin religa um perfil e **escolhe não** trazer uma role; numa segunda
deleção/reativação, a rejeitada não pode voltar de carona. Com data resolve-se sozinho (perfil
morre em T2 com as roles A e B; admin religa só A; perfil morre de novo em T3, levando só A;
religar restaura onde `deletedAt == T3` → B, parada em T2, não bate mais).
