# `PreviousEmail` reservava o endereço para sempre — e parou de reservar (D13, 8.6)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Troca de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A reserva perpétua nasceu na 7.15 com um argumento só: "mesmo idioma do email preso de conta
deletada" — sem ela, alguém que reconquistasse uma caixa antiga poderia se cadastrar do zero se
passando pelo dono original. Esse idioma **morreu na 8.4/8.5**, quando o email preso ganhou caminho
de volta por verificação de posse; manter a reserva do outro lado seria incoerente com o raciocínio
que a criou. Passa a valer só o email **atual** de uma conta (inclusive deletada), que o `@unique` de
`User.email` já garante sozinho. A liberação cobre os **três** call sites que produziam o mesmo 409
(signup de cliente, admin criando funcionário, `change-email`) — manter um bloqueando reintroduziria
a inconsistência, com o endereço livre por um caminho e preso por outro.

A tabela continua existindo como **histórico**: ser tabela (não array em `User`) segue o idioma de
`AuditLog`/`VerificationToken` — cada entrada tem timestamp próprio, é indexável e sobra espaço para
metadado futuro.
