import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle autocontido em .next/standalone: a imagem de produção copia só ele e
  // os estáticos, sem node_modules inteiro. Ver Dockerfile.
  output: "standalone",

  // O contrato é consumido do **fonte TS** (`exports` → `src/**/*.ts`, sem
  // `dist` — ver o README do pacote), e não é assim que um pacote de
  // `node_modules` costuma chegar: o normal é chegar compilado.
  //
  // Medido na 11.12: o Turbopack do Next 16 compila o fonte do pacote mesmo sem
  // esta linha, com a página importando o contrato. Ela fica porque é o que
  // **fixa** o comportamento — é a declaração que o Next suporta para pacote de
  // workspace entregue em TS. Sem ela, o build depende de um detalhe do
  // bundler, e é no bundle de servidor que isso custaria caro: pacote de
  // `node_modules` externalizado vira `require()` em runtime, e o `require` de
  // um `.ts` quebra depois do deploy, não no build.
  //
  // É o mesmo preço que a API paga do lado dela, com `noExternal` no tsup.
  transpilePackages: ["@pet-oasis/api-contracts"],
};

export default nextConfig;
