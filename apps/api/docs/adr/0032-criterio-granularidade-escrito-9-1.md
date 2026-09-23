# O critério de granularidade, escrito na 9.1

> Decisão migrada em 2026-09-18 do contexto temático da API (**Autorização** › *Catálogo de features*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

Até a Fase 8 o catálogo era fino em `user` (quatro verbos × dois escopos) e grosso em todo o
resto (`manage:session`, `manage:permission`, `manage:user:status`) sem que a regra estivesse
em lugar nenhum. A 9.1 escreveu o critério que já vinha sendo aplicado: **uma feature separada
existe quando dá para imaginar um cargo real que tenha ela e não tenha a vizinha.** Ninguém
precisa de "encerrar sessão mas não listar", então virou `manage:session`.

O que se perde ao agrupar não é elegância, é delegação: a menor unidade concedível por
override é o tamanho da feature. Com `manage:catalog` não existiria "conceder só cadastrar
produto ao Fulano". O que se perde ao esmiuçar é o oposto — features que nenhuma role usa
sozinha, que ninguém entende ao ler `GET /features`, e que inflam `DEFAULT_ROLES`. A alternativa
descartada era CRUD completo por recurso: levaria o catálogo de 24 para ~55 features na Fase 9.
