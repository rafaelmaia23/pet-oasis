import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle autocontido em .next/standalone: a imagem de produção copia só ele e
  // os estáticos, sem node_modules inteiro. Ver Dockerfile.
  output: "standalone",
};

export default nextConfig;
