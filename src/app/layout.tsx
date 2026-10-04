import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HydrationMarker } from "@/components/hydration-marker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finance Manager",
  description: "Gestão financeira familiar",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <HydrationMarker />
        {children}
      </body>
    </html>
  );
}
