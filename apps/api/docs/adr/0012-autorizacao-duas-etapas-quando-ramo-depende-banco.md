# Autorização em duas etapas quando o ramo depende do banco

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Ordem e forma da checagem*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Na rota de perfil o `canAccess` ganhou a forma OR (`string[]`) e declara as **duas** features,
porque o ramo (criar × reativar) só é conhecido depois de ler o banco; o service reconfere a
específica do ramo que correu. Sem a segunda etapa, ter só `reactivate:` deixaria criar do
zero. A checagem vem antes da busca do usuário (403 vence 404), então é a **união** das duas
que abre a porta.
