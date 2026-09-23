# A mesma rota cria e reativa (8.3)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Perfil — os fluxos de produto*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O cliente não sabe — nem deveria precisar saber — se aquele usuário já teve o perfil algum dia.
Dois endpoints obrigariam a consultar o estado antes de escolher o verbo, e a resposta é **201
nos dois ramos** pelo mesmo motivo (mesmo idioma do K4, em que re-conceder uma role não revela o
reuso da linha). Quem ramifica é o service, lendo o banco.

**Isto substituiu a regra do Ciclo 1**, em que `POST` de perfil devolvia dois 409 distintos —
"já possui" para perfil ativo e uma mensagem diferente para perfil soft-deletado, porque não
havia recovery. O 409 de perfil **ativo** continua valendo; o de perfil morto virou o ramo de
reativação.
