import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // ADR-005: empacotamento portátil
  poweredByHeader: false,
};

export default nextConfig;
