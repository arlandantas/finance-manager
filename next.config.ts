import type { NextConfig } from "next";
import { allowedDevOriginsFor } from "./src/lib/dev-origins";

// Origens de dev além de localhost (o Next bloqueia /_next/* de origem não permitida e a página nunca
// hidrata): APP_PUBLIC_ORIGIN (túnel), APP_DEV_ORIGINS (lista) e, por padrão, IPs privados RFC1918 e *.local.
const nextConfig: NextConfig = {
  output: "standalone", // ADR-005: empacotamento portátil
  allowedDevOrigins: allowedDevOriginsFor(process.env),
  poweredByHeader: false,
  // O E2E usa um diretório de build próprio para não colidir com o `pnpm dev` (porta 3100).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
