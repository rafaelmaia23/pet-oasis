# O aviso de segurança vai para o email antigo, no pedido — não na confirmação

> Decisão migrada em 2026-09-18 do contexto temático da API (**Identidade e sessões** › *Troca de email*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O cenário que essa notificação cobre é sessão/senha comprometida. Nele, o atacante tem a senha mas
não necessariamente a caixa antiga — então é o dono real, ainda com acesso a ela, quem recebe o
aviso. Mandar só depois de confirmada a troca chegaria tarde demais para reagir; mandar no pedido é
a única janela em que a troca ainda não é definitiva.
