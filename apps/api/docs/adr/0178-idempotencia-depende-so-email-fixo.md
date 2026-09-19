# A idempotência depende só do email fixo

> Decisão migrada em 2026-09-18 do contexto temático da API (**Infraestrutura** › *Dataset fake*), que deixou de existir:
> a partir daí, cada decisão é um ADR. O texto é o original; só os links foram reapontados.

A primeira versão do design cogitava semear nome/cpf/telefone com um `faker.seed()` fixo para o
dataset ser idêntico a cada reseed. Na implementação ficou claro que não é necessário: a checagem é
"existe um user com este email? se sim, pula" — uma vez criado, reruns nunca voltam a tocar
CPF/nome/telefone daquele registro. `cpf-cnpj-validator` (`cpf.generate()`) também não é
determinístico via seed do Faker (usa `Math.random` internamente), então perseguir determinismo total
exigiria mais uma dependência sem comprar nada: ninguém depende do CPF exato de um usuário fake.
Nome/telefone ainda usam seed fixo — estética, não a garantia de idempotência.
