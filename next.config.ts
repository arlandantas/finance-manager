import type { NextConfig } from "next";

// Origem pública de teste (ex.: túnel https://xxx.loca.lt). Sem ela, o dev só aceita localhost:
// o Next bloqueia /_next/* de outras origens e a página nunca hidrata (login de teste "morto").
const publicHost = (() => {
  try {
    return process.env.APP_PUBLIC_ORIGIN ? new URL(process.env.APP_PUBLIC_ORIGIN).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  output: "standalone", // ADR-005: empacotamento portátil
  allowedDevOrigins: publicHost ? [publicHost] : [],
  poweredByHeader: false,
  // O E2E usa um diretório de build próprio para não colidir com o `pnpm dev` (porta 3100).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
