# Um único `new Date()` por transação (D4)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Ciclo de vida** › *Soft delete*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O timestamp é a chave de correlação da restauração. Mesma transação **não** garante mesmo
instante — quem gera é o JS, não o banco —, e `deleteCustomerProfile` chamava `new Date()` duas
vezes, o `softDelete` do user três. Se essa invariante vazar, o bug é **silencioso**: nada
quebra na deleção, só a restauração passa a não achar os filhos. Por isso existe teste dedicado
provando a igualdade nos quatro níveis, e nenhuma função de cascata pode chamar `new Date()`
internamente — o valor entra por parâmetro.
