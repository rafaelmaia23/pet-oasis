# Gotcha do reseed compartilhado (7.14)

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Seeds e ambiente demo*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

O seed foi extraído para `src/lib/seedDatabase.ts` (`runSeed`, **sem nenhum código auto-executável
no nível do módulo**) e é reusado por `prisma/seed.ts` (CLI) e por `demo-reset.ts`. A primeira
tentativa importava `runSeed` direto de `prisma/seed.ts`, que tinha um `main()` guardado por
`import.meta.url === argv[1]`: o guard funciona em dev, mas o tsup bundla os dois scripts num módulo
só, então **ambos os guards passaram a comparar contra o mesmo** `import.meta.url`/`argv[1]` e
disparavam juntos — rodar `demo-reset.js` executava (e desconectava) o `main()` do seed por baixo. A
lição vale para qualquer script novo: código reaproveitado entre entrypoints não pode carregar
auto-execução.
