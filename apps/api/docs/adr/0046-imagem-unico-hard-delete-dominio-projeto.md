# Imagem é o único hard delete de domínio do projeto (9.10)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Restauração*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

`ProductImage` é a única tabela de domínio **sem `deletedAt`**, e as fotos de pet e os logos de
marca são apagados do disco de verdade quando trocados ou removidos. É exceção consciente à
regra geral, e o critério é o mesmo que justifica a regra: o soft delete existe para preservar
**fato de negócio** (quem comprou o quê, quem tinha qual permissão quando). Imagem não é fato,
é *asset*.

As três alternativas foram avaliadas e duas recusadas. Soft delete da linha **com** o arquivo
apagado cria a linha-apontando-para-o-nada que o [ADR de upload](0010-file-storage-and-uploads.md)
classifica como mais grave que um órfão no disco — o sintoma é imagem quebrada na vitrine, e o
dado preservado não serve para nada. Soft delete da linha **preservando** o arquivo daria
"desfazer", ao custo de disco que nunca mais é liberado por um dado que ninguém vai auditar.

O rastro de que a imagem existiu fica no **audit log** (`PRODUCT_IMAGE_DELETED`,
`PET_PHOTO_DELETED`, `BRAND_LOGO_DELETED`), exatamente como na tag (9.6/W5), que é o outro hard
delete do projeto.

**A assimetria com o dono é o ponto delicado, e é deliberada:** o soft delete do **produto**
não apaga arquivo nenhum. Produto excluído pode ser restaurado (Fase 8), e voltar sem imagem
seria uma promessa parcial que nada na resposta anuncia — a mesma classe de erro que o D6'
fechou do outro lado. O disco perdido é limitado (no máximo 8 imagens por produto morto), e é
a varredura de órfãos que ganha, mais tarde, uma política de retenção se isso um dia importar.
