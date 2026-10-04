import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { TunnelRetry } from "@/components/tunnel-retry";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Manager",
  description: "Gestão financeira familiar",
};

// Túnel de teste (dev): ver public/tunnel-retry-sw.js. Nunca em produção.
const tunnelDev = process.env.NODE_ENV !== "production" && !!process.env.APP_PUBLIC_ORIGIN;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <HydrationMarker />
        {tunnelDev ? <TunnelRetry /> : null}
        {children}
      </body>
    </html>
  );
}
