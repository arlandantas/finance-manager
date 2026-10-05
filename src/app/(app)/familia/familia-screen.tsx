"use client";

import { UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { InviteForm } from "@/components/invite-form";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  type SettlementPending,
  useCancelInvitation,
  useFamily,
  useUpdateFamilySettings,
} from "@/modules/familia/hooks";
import type { InvitationDTO } from "@/modules/familia/schemas";

const ROLE_LABEL = { ADMIN: "Administrador", MEMBER: "Membro" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function validity(inv: InvitationDTO): string {
  if (inv.isExpired) return "Expirado";
  const days = Math.max(1, Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / DAY_MS));
  return `Expira em ${days} ${days === 1 ? "dia" : "dias"}`;
}

function SettlementSetting({
  enabled,
  version,
  isAdmin,
}: {
  enabled: boolean;
  version: number;
  isAdmin: boolean;
}) {
  const update = useUpdateFamilySettings();
  const router = useRouter();
  const [pending, setPending] = useState<SettlementPending | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());

  function send(next: boolean, confirmPending = false) {
    if (update.isPending) return;
    setBanner(null);
    update.mutate(
      { version, settlementEnabled: next, confirmPending, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          setPending(null);
          router.refresh(); // o menu (server component) reflete a chave
          toast.success(next ? "Acerto de contas ligado" : "Acerto de contas desligado");
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "SETTLEMENT_PENDING") {
            keyRef.current = newIdempotencyKey(); // a 409 não fica gravada: o reenvio usa chave nova
            setPending(e.details as SettlementPending);
          } else if (e instanceof NetworkError) setBanner(e.message);
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  return (
    <section aria-labelledby="settings-title" className="flex flex-col gap-3">
      <h2 id="settings-title" className="text-lg font-semibold text-slate-900">
        Configurações da família
      </h2>
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {banner}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div className="min-w-0">
          <p id="settlement-switch-label" className="font-medium text-slate-900">
            Acerto de contas entre membros
          </p>
          {!isAdmin ? (
            <p className="text-xs text-slate-500">Só o Administrador pode alterar</p>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="settlement-switch-label"
          disabled={!isAdmin || update.isPending}
          onClick={() => send(!enabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-brand-700" : "bg-slate-300"}`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
          />
        </button>
      </div>
      <Drawer
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Desligar o acerto de contas?"
      >
        <div className="flex flex-col gap-3">
          <p data-testid="settlement-pending-warning" className="text-sm text-slate-800">
            Há {pending ? <Money cents={pending.pendingInCents} /> : null} a acertar entre os
            membros. Ao desligar, o valor fica guardado e volta se você religar.
          </p>
          <Button variant="danger" disabled={update.isPending} onClick={() => send(false, true)}>
            Desligar mesmo assim
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </section>
  );
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

          <SettlementSetting
            enabled={data.family.settlementEnabled}
            version={data.family.version}
            isAdmin={isAdmin}
          />

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
