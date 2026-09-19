# Forçar troca de senha bloqueia o login inteiro

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Senha*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Um admin força esse reset justamente porque a senha atual pode estar comprometida. Deixar essa
senha completar o login — mesmo que só para cair numa tela de "troque agora" — daria a quem tiver a
senha (inclusive um atacante) uma sessão válida antes da troca, anulando o motivo do reset. O único
caminho de volta é o link por email, mesmo desenho do `forgot-password`; só a origem do token muda
(admin em vez do usuário), e `resetPassword` só ganhou um passo: limpar `mustChangePassword` ao
consumir o token.
