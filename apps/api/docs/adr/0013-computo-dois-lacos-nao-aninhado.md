# Cômputo em dois laços, não um aninhado

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Ordem e forma da checagem*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`computeEffectiveFeatures` não mudou de assinatura na 8.0, mas passou a ser **dois laços**:
todas as features estáticas antes de qualquer override. Num laço só, um deny pendurado na
role A seria aplicado antes de a role B somar a feature, e o resultado dependeria da **ordem
das roles**.
