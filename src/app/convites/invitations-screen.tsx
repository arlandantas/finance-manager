"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { InvitationCard } from "@/components/invitation-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/http";
import type { MyInvitationsResponse } from "@/modules/familia/invitations/schemas";
import { LinkedInvitationCard } from "./linked-invitation-card";

/** SEC-004 (SDD-028 §1.4): "Você foi convidado" — lista todos os convites válidos, sem escolher nenhum. */
export function InvitationsScreen() {
  const router = useRouter();
  const [gone, setGone] = useState<string[]>([]);
  const q = useQuery({
    queryKey: ["my-invitations"],
    queryFn: () => apiFetch<MyInvitationsResponse>("/api/v1/me/invitations"),
    staleTime: 0,
  });
  const items = (q.data?.invitations ?? []).filter((i) => !gone.includes(i.id));
  const empty = q.isSuccess && items.length === 0;
  useEffect(() => {
    if (empty) router.replace("/onboarding");
  }, [empty, router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-brand-800 dark:text-emerald-300">
          Finance Manager
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Você foi convidado</h1>
        <p className="text-slate-600">
          Você só entra em uma família se tocar em Entrar. Nada acontece sozinho.
        </p>
      </header>
      {q.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-32" />
        </div>
      ) : null}
      {q.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {items.map((inv) =>
            inv.linked ? (
              <LinkedInvitationCard
                key={inv.id}
                invitation={{ ...inv, linked: inv.linked }}
                onGone={(id) => setGone((g) => [...g, id])}
              />
            ) : (
              <InvitationCard
                key={inv.id}
                invitation={inv}
                onGone={(id) => setGone((g) => [...g, id])}
              />
            ),
          )}
        </ul>
      ) : null}
      <Link
        href="/onboarding?skip_invites=1"
        className="inline-flex min-h-11 items-center justify-center text-sm font-semibold text-brand-800 underline dark:text-emerald-300"
      >
        Prefiro criar minha própria família
      </Link>
    </main>
  );
}
