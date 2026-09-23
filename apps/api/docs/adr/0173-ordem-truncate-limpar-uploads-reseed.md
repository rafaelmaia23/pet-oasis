# A ordem é truncate → limpar uploads → reseed (9.11)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O filesystem não participa da transação do Postgres, então a ordem decide qual inconsistência é
possível. Nesta, falhar no meio deixa banco e disco vazios **juntos**, e o próximo reset conserta. A
ordem inversa (limpar antes do truncate) deixaria linha de `ProductImage` — e `Pet.photoPath`,
`Brand.logoPath` — apontando para arquivo inexistente, que o ADR de storage classifica como mais
grave que um órfão no disco. Recusado também reusar a varredura do `cleanup-uploads.ts`: ela tem
carência de 24 h (`UPLOAD_ORPHAN_GRACE_HOURS`) e não removeria nada num reset, e baixar a carência
seria mexer na proteção pelo motivo errado.
