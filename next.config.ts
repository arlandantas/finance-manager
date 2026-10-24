import type { NextConfig } from "next";
import { allowedDevOriginsFor } from "./src/lib/dev-origins";

// Origens de dev além de localhost (o Next bloqueia /_next/* de origem não permitida e a página nunca
// hidrata): APP_PUBLIC_ORIGIN (túnel), APP_DEV_ORIGINS (lista) e, por padrão, IPs privados RFC1918 e *.local.
const nextConfig: NextConfig = {
  output: "standalone", // ADR-005/ADR-031: usado só pelo Dockerfile; a Vercel ignora e usa o próprio adapter
  allowedDevOrigins: allowedDevOriginsFor(process.env),
  poweredByHeader: false,
  // SEC-002: o app não usa `next/image`; desliga o otimizador (/_next/image) para reduzir a superfície.
  images: { unoptimized: true },
  // SDD-024 §4.3: a tela de consentimento OAuth não pode ser embutida (clickjacking).
  async headers() {
    return [
      {
        source: "/oauth/consent",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
  // O E2E usa um diretório de build próprio para não colidir com o `pnpm dev` (porta 3100).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
