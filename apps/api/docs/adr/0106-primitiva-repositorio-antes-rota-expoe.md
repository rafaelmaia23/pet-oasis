# Primitiva de repositório antes da rota que a expõe

> Decisão migrada em 2026-09-18 do contexto temático da API (**Arquitetura** › *Ordem de construção*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Quando uma mecânica serve a três níveis e só um tem rota, os três nascem juntos no repositório, com
os sem-rota cobertos por teste de integração chamando o repositório direto. Foi assim com a
restauração (K7) — ver [`0044`](0044-tres-niveis-nasceram-como-primitivas-repositorio.md).
