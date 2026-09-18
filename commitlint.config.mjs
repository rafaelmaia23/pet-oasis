// Conventional Commits do monorepo: `tipo(escopo): descrição`, em inglês.
//
// `config-conventional` traz o enum de tipos (feat, fix, docs, build, ci, refactor,
// test, chore, perf, style, revert), o header em até 100 colunas, tipo em minúsculas e
// subject sem ponto final nem inicial maiúscula. O que a raiz acrescenta é o ESCOPO:
// obrigatório e restrito aos pacotes do workspace mais os dois transversais (`infra`,
// `ci`) e o próprio repositório (`repo`, para o que é da raiz — workspace, Turbo, este
// arquivo). Multi-escopo com vírgula (`feat(api,contracts): …`) passa: a regra
// `scope-enum` já separa por `,`, `/` e `\` e confere cada pedaço. App novo entra aqui
// quando existir.
//
// O hook `.husky/commit-msg` roda `commitlint --edit` sobre a mensagem antes de o commit
// existir. Mensagem que começa com `Merge …` (a padrão do `git merge --no-ff`) é ignorada
// pelo commitlint por padrão — por isso o estilo `merge: …` das fases anteriores foi
// abandonado: ele teria de passar pelo enum de tipos.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-empty": [2, "never"],
    "scope-enum": [
      2,
      "always",
      [
        "api",
        "web",
        "contracts",
        "tsconfig",
        "biome-config",
        "infra",
        "ci",
        "repo",
      ],
    ],
  },
};
