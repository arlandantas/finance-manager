"use client";

import { UserPlus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { InviteForm } from "@/components/invite-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, newIdempotencyKey } from "@/lib/http";
import { useCancelInvitation, useFamily } from "@/modules/familia/hooks";
import type { InvitationDTO } from "@/modules/familia/schemas";

const ROLE_LABEL = { ADMIN: "Administrador", MEMBER: "Membro" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function validity(inv: InvitationDTO): string {
  if (inv.isExpired) return "Expirado";
  const days = Math.max(1, Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / DAY_MS));
  return `Expira em ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function FamiliaScreen() {
  const family = useFamily();
  const cancel = useCancelInvitation();
  const [inviting, setInviting] = useState(false);
  const [canceling, setCanceling] = useState<InvitationDTO | null>(null);
  const cancelKey = useRef(newIdempotencyKey());
  const data = family.data;
  const isAdmin = data?.currentRole === "ADMIN";

  return (
    <main className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Família</h1>
        {isAdmin ? (
          <Button onClick={() => setInviting(true)}>
            <UserPlus size={18} aria-hidden="true" />
            Convidar membro
          </Button>
        ) : null}
      </header>

      {family.isPending ? (
        <div aria-busy="true" aria-label="Carregando família" className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {family.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => family.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <p className="text-slate-600">{data.family.name}</p>

          {data.members.length === 1 && isAdmin ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="font-medium text-brand-800">Convide quem divide as contas com você</p>
              <Button onClick={() => setInviting(true)}>Convidar membro</Button>
            </div>
          ) : null}

          <section aria-labelledby="members-title" className="flex flex-col gap-3">
            <h2 id="members-title" className="text-lg font-semibold text-slate-900">
              Membros
            </h2>
            <ul className="flex flex-col gap-2">
              {data.members.map((m) => (
                <li
                  key={m.memberId}
                  data-testid="member-row"
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                >
                  <Avatar name={m.name} image={m.image} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{m.name}</p>
                    <p className="truncate text-sm text-slate-500">{m.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {ROLE_LABEL[m.role]}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {isAdmin ? (
            <section aria-labelledby="pending-title" className="flex flex-col gap-3">
              <h2 id="pending-title" className="text-lg font-semibold text-slate-900">
                Convites pendentes
              </h2>
              {data.pendingInvitations.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum convite pendente.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.pendingInvitations.map((inv) => (
                    <li
                      key={inv.id}
                      data-testid="invitation-row"
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{inv.email}</p>
                        <p className="text-sm text-slate-500">
                          {ROLE_LABEL[inv.role]} · {validity(inv)}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          cancelKey.current = newIdempotencyKey();
                          setCanceling(inv);
                        }}
                      >
                        <X size={16} aria-hidden="true" />
                        Cancelar convite
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      <Drawer open={inviting} onOpenChange={setInviting} title="Convidar membro">
        <InviteForm onDone={() => setInviting(false)} />
      </Drawer>

      <Drawer
        open={canceling !== null}
        onOpenChange={(o) => !o && setCanceling(null)}
        title="Cancelar convite?"
        description={canceling ? `O convite para ${canceling.email} deixará de valer.` : undefined}
      >
        <div className="flex flex-col gap-3">
          <Button
            variant="danger"
            disabled={cancel.isPending}
            onClick={() => {
              if (!canceling) return;
              cancel.mutate(
                { id: canceling.id, idempotencyKey: cancelKey.current },
                {
                  onSuccess: () => {
                    toast.success("Convite cancelado");
                    setCanceling(null);
                  },
                  onError: (e) => {
                    toast.error(
                      e instanceof ApiClientError ? e.message : "Não foi possível cancelar.",
                    );
                    setCanceling(null);
                  },
                },
              );
            }}
          >
            {cancel.isPending ? "Cancelando…" : "Sim, cancelar convite"}
          </Button>
          <Button variant="ghost" onClick={() => setCanceling(null)}>
            Voltar
          </Button>
        </div>
      </Drawer>
    </main>
  );
}
