"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useFamily } from "@/modules/familia/hooks";
import { UsageBlock } from "./usage-block";

export function IaScreen() {
  const family = useFamily();
  const isAdmin = family.data?.currentRole === "ADMIN";

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/familia" className="text-sm text-brand-700 underline">
          Voltar para Família
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">IA e privacidade</h1>
      </header>
      {family.isPending ? <Skeleton className="h-16" /> : null}
      {family.data && isAdmin ? <UsageBlock /> : null}
    </main>
  );
}
