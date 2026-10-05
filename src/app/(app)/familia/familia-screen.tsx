"use client";

import { LogOut, MoreHorizontal, Pencil, UserCog, UserMinus, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { InviteForm } from "@/components/invite-form";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass } from "@/components/ui/field";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  type SettlementPending,
  useCancelInvitation,
  useChangeRole,
  useFamily,
  useRotateInvitation,
  useUpdateFamily,
  useUpdateFamilySettings,
} from "@/modules/familia/hooks";
import type { FamilyDTO, InvitationDTO, Role } from "@/modules/familia/schemas";
import { RemoveMemberDialog } from "./remove-member-dialog";

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
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3">
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
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white dark:bg-slate-100 shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`}
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

const EVENT_TEXT: Record<FamilyDTO["events"][number]["type"], string> = {
  FAMILY_RENAMED: "renomeou a família",
  ROLE_CHANGED: "alterou o papel de",
  SETTLEMENT_TOGGLED: "alterou o acerto de contas",
  MEMBER_REMOVED: "removeu",
  MEMBER_LEFT: "saiu da família",
  INVITATION_RESENT: "reenviou um convite",
};

function RenameDialog({
  open,
  name,
  version,
  onClose,
}: {
  open: boolean;
  name: string;
  version: number;
  onClose: () => void;
}) {
  const update = useUpdateFamily();
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const trimmed = value.trim();
  const invalid = trimmed.length < 2 || trimmed.length > 60;

  function save() {
    if (update.isPending) return;
    if (invalid) {
      setError("Informe um nome com 2 a 60 caracteres");
      return;
    }
    setError(null);
    update.mutate(
      { version, name: trimmed, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          toast.success("Família atualizada");
          router.refresh(); // o nome vive no cabeçalho (server component)
          onClose();
        },
        onError: (e) => {
          if (e instanceof NetworkError) setError(e.message);
          else setError(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (o) setValue(name);
        else onClose();
      }}
      title="Editar nome da família"
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field id="family-rename" label="Nome da família" error={error ?? undefined}>
          <input
            id="family-rename"
            className={inputClass}
            value={value}
            autoComplete="off"
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Button type="submit" disabled={update.isPending}>
          Salvar
        </Button>
      </form>
    </Drawer>
  );
}

function RoleDialog({
  member,
  onClose,
}: {
  member: { memberId: string; name: string; role: Role } | null;
  onClose: () => void;
}) {
  const change = useChangeRole();
  const [role, setRole] = useState<Role>("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const router = useRouter();

  return (
    <Drawer
      open={member !== null}
      onOpenChange={(o) => {
        if (o && member) setRole(member.role);
        if (!o) onClose();
      }}
      title={member ? `Alterar papel de ${member.name.split(" ")[0]}` : "Alterar papel"}
    >
      {member ? (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (change.isPending) return;
            setError(null);
            change.mutate(
              { memberId: member.memberId, role, idempotencyKey: keyRef.current },
              {
                onSuccess: () => {
                  keyRef.current = newIdempotencyKey();
                  toast.success("Papel atualizado");
                  router.refresh();
                  onClose();
                },
                onError: (e) => {
                  keyRef.current = newIdempotencyKey();
                  setError(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
                },
              },
            );
          }}
        >
          <Field id="role-select" label="Papel" error={error ?? undefined}>
            <select
              id="role-select"
              className={inputClass}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="ADMIN">Administrador</option>
              <option value="MEMBER">Membro</option>
            </select>
          </Field>
          <Button type="submit" disabled={change.isPending}>
            Salvar papel
          </Button>
        </form>
      ) : null}
    </Drawer>
  );
}

function InvitationActions({ inv }: { inv: InvitationDTO }) {
  const rotate = useRotateInvitation();
  const [link, setLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function run(mode: "link" | "resend") {
    if (rotate.isPending) return;
    setMsg(null);
    rotate.mutate(
      { id: inv.id, mode, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: async (r) => {
          setLink(r.inviteUrl);
          if (mode === "link") {
            try {
              await navigator.clipboard.writeText(r.inviteUrl);
            } catch {
              // sem permissão de área de transferência: o link aparece abaixo para copiar à mão
            }
            toast.success("Link copiado", { description: "O link anterior deixa de valer." });
          } else {
            toast.success(
              r.emailStatus === "FAILED"
                ? "Convite renovado, mas o e-mail falhou"
                : "E-mail reenviado",
              {
                description: "O link anterior deixa de valer.",
              },
            );
          }
        },
        onError: (e) =>
          setMsg(e instanceof Error ? e.message : "Erro inesperado. Tente novamente."),
      },
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={inv.isExpired || rotate.isPending}
          onClick={() => run("link")}
        >
          Copiar link
        </Button>
        <Button variant="secondary" disabled={rotate.isPending} onClick={() => run("resend")}>
          Reenviar e-mail
        </Button>
        <span className="self-center text-xs text-slate-500">
          {Math.max(0, 3 - inv.resendCount)} reenvios restantes
        </span>
      </div>
      {msg ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          {msg}
        </p>
      ) : null}
      {link ? (
        <input readOnly aria-label="Link do convite" value={link} className={inputClass} />
      ) : null}
    </div>
  );
}

export function FamiliaScreen() {
  const family = useFamily();
  const cancel = useCancelInvitation();
  const [inviting, setInviting] = useState(false);
  const [canceling, setCanceling] = useState<InvitationDTO | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState<{
    memberId: string;
    name: string;
    self: boolean;
  } | null>(null);
  const [rolling, setRolling] = useState<{ memberId: string; name: string; role: Role } | null>(
    null,
  );
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
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => family.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex items-center gap-2">
            <p data-testid="family-title" className="text-slate-600">
              {data.family.name}
            </p>
            {isAdmin ? (
              <Button variant="ghost" onClick={() => setRenaming(true)}>
                <Pencil size={16} aria-hidden="true" />
                Editar nome
              </Button>
            ) : null}
          </div>

          {data.members.length === 1 && isAdmin ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
              <p className="font-medium text-brand-800 dark:text-emerald-300">
                Convide quem divide as contas com você
              </p>
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
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
                >
                  <Avatar name={m.name} image={m.image} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{m.name}</p>
                    <p className="truncate text-sm text-slate-500">{m.email}</p>
                  </div>
                  <span
                    data-testid="member-role"
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {ROLE_LABEL[m.role]}
                  </span>
                  {m.canChangeRole || m.memberId === data.currentMemberId ? (
                    <Menu
                      label={`Ações de ${m.name.split(" ")[0]}`}
                      trigger={<MoreHorizontal size={20} aria-hidden="true" />}
                    >
                      {(close) => (
                        <>
                          {m.canChangeRole ? (
                            <MenuItem
                              onClick={() => {
                                close();
                                setRolling({ memberId: m.memberId, name: m.name, role: m.role });
                              }}
                            >
                              <UserCog size={16} aria-hidden="true" />
                              Alterar papel
                            </MenuItem>
                          ) : null}
                          {m.memberId === data.currentMemberId ? (
                            <MenuItem
                              onClick={() => {
                                close();
                                setRemoving({ memberId: m.memberId, name: m.name, self: true });
                              }}
                            >
                              <LogOut size={16} aria-hidden="true" />
                              Sair da família
                            </MenuItem>
                          ) : isAdmin ? (
                            <MenuItem
                              onClick={() => {
                                close();
                                setRemoving({ memberId: m.memberId, name: m.name, self: false });
                              }}
                            >
                              <UserMinus size={16} aria-hidden="true" />
                              Remover
                            </MenuItem>
                          ) : null}
                        </>
                      )}
                    </Menu>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <SettlementSetting
            enabled={data.family.settlementEnabled}
            version={data.family.version}
            isAdmin={isAdmin}
          />

          {data.exMembers.length > 0 ? (
            <section aria-labelledby="ex-title" className="flex flex-col gap-2">
              <h2 id="ex-title" className="text-lg font-semibold text-slate-900">
                Ex-membros
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-slate-600">
                {data.exMembers.map((x) => (
                  <li key={x.id} data-testid="ex-member">
                    {x.name} (ex-membro)
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.events.length > 0 ? (
            <section aria-labelledby="events-title" className="flex flex-col gap-2">
              <h2 id="events-title" className="text-lg font-semibold text-slate-900">
                Atividade recente
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-slate-600">
                {data.events.map((e, i) => (
                  <li key={`${e.at}-${i}`} data-testid="family-event">
                    {e.actor.name.split(" ")[0]} {EVENT_TEXT[e.type]}
                    {e.target ? ` ${e.target.name.split(" ")[0]}` : ""} ·{" "}
                    {new Date(e.at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
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
                      <InvitationActions inv={inv} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </>
      ) : null}

      {data ? (
        <RenameDialog
          open={renaming}
          name={data.family.name}
          version={data.family.version}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      <RoleDialog member={rolling} onClose={() => setRolling(null)} />
      <RemoveMemberDialog
        target={removing}
        familyName={data?.family.name ?? ""}
        onClose={() => setRemoving(null)}
      />

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
