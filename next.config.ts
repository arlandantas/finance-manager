import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // ADR-005: empacotamento portátil
  poweredByHeader: false,
  // O E2E usa um diretório de build próprio para não colidir com o `pnpm dev` (porta 3100).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
