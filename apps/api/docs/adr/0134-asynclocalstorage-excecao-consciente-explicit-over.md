# `AsyncLocalStorage` é exceção consciente a "explicit over implicit"

> Decisão migrada em 2026-09-18 do contexto temático da API (**Observabilidade** › *As três categorias*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Correlacionar as três categorias exige um `requestId` disponível em qualquer camada. A
alternativa explícita seria passar um `context` em toda assinatura de service — dezenas de
assinaturas poluídas para entregar um valor usado só no fundo da pilha. A exceção fica
**limitada ao contexto de observabilidade**: nenhuma regra de negócio lê do store.
