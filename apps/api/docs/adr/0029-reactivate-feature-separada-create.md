# `reactivate:*` é feature separada de `create:*` (K12)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

São poderes diferentes: criar faz o perfil nascer com as roles default; reativar traz de volta
as roles que aquele perfil tinha antes de morrer, incluindo as que um admin concedeu no
passado. Separadas, cada uma é concedível e revogável por override sem carregar a outra. Um
`manage:profile` genérico daria a quem só cadastra cliente no balcão o poder de ressuscitar um
conjunto de permissões que ele nem consegue enxergar.
