import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import { TunnelRetry } from "@/components/tunnel-retry";
import { hostnameOf } from "@/lib/dev-origins";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Manager",
  description: "Gestão financeira familiar",
};

// Túnel de teste (dev): ver public/tunnel-retry-sw.js. Nunca em produção.
// O SW só é registrado quando a página é aberta no host do túnel (APP_PUBLIC_ORIGIN), não em localhost/LAN.
const tunnelHost =
  process.env.NODE_ENV !== "production" ? hostnameOf(process.env.APP_PUBLIC_ORIGIN) : undefined;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <HydrationMarker />
        {tunnelHost ? <TunnelRetry host={tunnelHost} /> : null}
        {children}
      </body>
    </html>
  );
}
