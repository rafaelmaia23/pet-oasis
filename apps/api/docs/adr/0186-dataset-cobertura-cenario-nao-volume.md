# O dataset é cobertura de cenário, não volume

> Decisão migrada em 2026-09-18 do contexto temático da API (**Domínio pet shop** › *Dataset fake do domínio (9.11)*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O `FAKE_USER_ROSTER` já era assim — `PENDING`, `BANNED`, `DELETED_USER` não existem para encher
lista, existem para a demo mostrar comportamento. O catálogo e os pets seguem a mesma regra, e cada
cenário é afirmado por teste em vez de descrito em comentário, porque um roster errado não estoura
em lugar nenhum: o seed continua rodando e a demo silenciosamente para de demonstrar o que a fase
construiu.

No catálogo: 29 produtos `ACTIVE` (28 visíveis, um soft-deletado), 4 `DRAFT` e 2 `DISCONTINUED`,
para a view pública da 9.8 ter o que esconder e a de staff ter o que mostrar a mais; um produto
**sem imagem nenhuma**; um com **galeria de três**; dois esgotados de formas diferentes — um produto
inteiro em zero e um cuja **variante default** está em zero com as outras em estoque; uma folha de
3º nível com item único; quatro variantes com `compareAtPriceCents`.

Nos pets: um cliente **sem pet nenhum** (lista vazia é estado que a API responde), um com três, um
falecido, um soft-deletado por si, dois em espécie que **proíbe** raça (coelho e hamster), dois sem
microchip, e pets em donos de cenário — inclusive o do dono soft-deletado.
