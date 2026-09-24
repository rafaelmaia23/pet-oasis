import type { AuthUser } from "@/lib/authorization";
import { hasFeature } from "@/lib/authorization";

/**
 * Um degrau da escada: a view e a feature que o destrava. `feature: null` é o
 * degrau base — o que todo ator recebe, inclusive quem não tem nenhuma
 * feature da escada ou não existe (visitante anônimo).
 */
type ViewLadderRung<V> = {
  readonly view: V;
  readonly feature: string | null;
};

type ViewLadder<V> = readonly [ViewLadderRung<V>, ...ViewLadderRung<V>[]];

/**
 * O único ponto de leitura da correspondência degrau → feature
 * (`docs/adr/0204-escada-declara-par-passo-feature-contrato-continua-so-declarando.md`
 * da API): percorre a escada do degrau base ao mais alto e devolve o último
 * cujo par o ator alcança — a mesma lógica que antes se repetia, verbatim,
 * entre usuário, produto e variante.
 */
export function chooseView<V>(
  ladder: ViewLadder<V>,
  actor: AuthUser | undefined,
): V {
  let chosen = ladder[0].view;

  for (const rung of ladder) {
    if (rung.feature === null || (actor && hasFeature(actor, rung.feature))) {
      chosen = rung.view;
    }
  }

  return chosen;
}

/**
 * O ator alcançou algum degrau além do base desta escada? Deriva da mesma
 * declaração que escolhe a view — é o que substitui um predicado de filtro
 * escrito à parte, que podia divergir da view escolhida sem que nada
 * acusasse.
 */
export function reachesBeyondBase<V>(
  ladder: ViewLadder<V>,
  actor: AuthUser | undefined,
): boolean {
  return chooseView(ladder, actor) !== ladder[0].view;
}
