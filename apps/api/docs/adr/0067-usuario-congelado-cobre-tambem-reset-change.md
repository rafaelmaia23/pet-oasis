# "Usuário congelado" cobre também reset e change

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Ban — a conta congelada*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Banido não faz **nada** com o próprio `User`: login bloqueado (403), forgot/reset e resend-verification viram
no-op (200 genérico, nenhum email sai), sessões vivas derrubadas. Além de login/forgot/resend,
`reset-password` (com token válido) e `change-password` (com Bearer válido) também recusam dono
banido com **403** — fecha a brecha de um token emitido enquanto o usuário estava ativo ser usado logo
após o ban. O ban é estado terminal, reversível só por desban de um admin.
