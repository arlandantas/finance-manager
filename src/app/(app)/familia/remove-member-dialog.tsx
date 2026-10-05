"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useRemovalReview, useRemoveMember } from "@/modules/familia/hooks";

type Target = { memberId: string; name: string; self: boolean };

/**
 * Remover membro / sair da família (US-035): diálogo em duas etapas. (1) Revisão das pendências
 * (acerto, contas, cartões, previstas); (2) confirmação textual. O botão destrutivo só habilita com
 * as pendências resolvidas; o servidor reavalia tudo dentro do lock.
 */
export function RemoveMemberDialog({
  target,
  familyName,
  onClose,
}: {
  target: Target | null;
  familyName: string;
  onClose: () => void;
}) {
  const review = useRemovalReview(target?.memberId ?? null, target?.self ?? false);
  const remove = useRemoveMember();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [ack, setAck] = useState(false);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [cardOwners, setCardOwners] = useState<Record<string, string>>({});
  const [plannedTo, setPlannedTo] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const r = review.data;
  const first = target?.name.split(" ")[0] ?? "";

  const pendingOwners = (r?.accounts ?? []).filter((a) => a.mustReassign && !owners[a.id]);
  const pendingCards = (r?.cards ?? []).filter((c) => c.mustReassign && !cardOwners[c.id]);
  const needsAck = (r?.settlement.enabled ?? false) && (r?.settlement.totalInCents ?? 0) > 0;
  const plannedNeedsPick = (target?.self ?? false) && (r?.planned.length ?? 0) > 0 && !plannedTo;
  const blocked = (r?.blockers.length ?? 0) > 0;
  const ready =
    !blocked &&
    pendingOwners.length === 0 &&
    pendingCards.length === 0 &&
    (!needsAck || ack) &&
    !plannedNeedsPick;
  const verb = target?.self ? "Sair da família" : "Remover membro";
  const expected = target?.self ? "Sair" : `Remover ${first}`;

  function reset() {
    setStep(1);
    setAck(false);
    setOwners({});
    setCardOwners({});
    setPlannedTo("");
    setConfirmText("");
    setError(null);
  }

  function submit() {
    if (!target || remove.isPending) return;
    setError(null);
    remove.mutate(
      {
        memberId: target.memberId,
        self: target.self,
        body: {
          acknowledgeSettlement: ack,
          reassign: {
            accounts: owners,
            cards: cardOwners,
            ...(plannedTo ? { plannedTo } : {}),
          },
        },
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          if (target.self) {
            router.replace(`/onboarding?left=${encodeURIComponent(familyName)}`);
          } else {
            toast.success(`${first} foi removido da família`);
            router.refresh();
            onClose();
          }
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          if (e instanceof NetworkError) setError(e.message);
          else if (e instanceof ApiClientError) setError(e.message);
          else setError("Erro inesperado. Tente novamente.");
          setStep(1);
        },
      },
    );
  }

  return (
    <Drawer
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
      title={target?.self ? "Sair da família" : `Remover ${first}`}
    >
      {target ? (
        <div className="flex flex-col gap-4">
          {review.isPending ? <p className="text-sm text-slate-600">Carregando revisão…</p> : null}
          {review.isError ? (
            <p role="alert" className="text-sm text-red-800">
              Não foi possível carregar
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          {r && blocked ? (
            <p
              role="alert"
              data-testid="removal-blocked"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900"
            >
              {r.blockers.includes("ONLY_MEMBER")
                ? "Você é a única pessoa na família. Convide alguém antes de sair."
                : target.self
                  ? "Você é a única pessoa Administradora. Promova outro membro antes de sair."
                  : "A pessoa é a única Administradora. Promova outro membro antes de removê-la."}
            </p>
          ) : null}

          {r && step === 1 ? (
            <>
              <ul
                className="flex flex-col gap-3 text-sm text-slate-800"
                data-testid="removal-review"
              >
                {needsAck ? (
                  <li>
                    <p>
                      Há <Money cents={r.settlement.totalInCents} /> a acertar entre vocês. A
                      diferença continua registrada no histórico.
                    </p>
                    <label className="mt-1 flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={ack}
                        onChange={(e) => setAck(e.target.checked)}
                      />
                      Reconheço a diferença
                    </label>
                  </li>
                ) : null}
                {r.accounts.map((a) => (
                  <li key={a.id} data-testid="removal-account">
                    {a.mustReassign ? (
                      <>
                        <p>A conta {a.name} tem saldo. Passe a titularidade para outro membro.</p>
                        <select
                          aria-label={`Novo titular de ${a.name}`}
                          className={inputClass}
                          value={owners[a.id] ?? ""}
                          onChange={(e) => setOwners((o) => ({ ...o, [a.id]: e.target.value }))}
                        >
                          <option value="">Escolha o novo titular</option>
                          {r.candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <p>
                        1 conta de {first} será arquivada ({a.name}).
                      </p>
                    )}
                  </li>
                ))}
                {r.cards.map((c) => (
                  <li key={c.id} data-testid="removal-card">
                    {c.mustReassign ? (
                      <>
                        <p>
                          O cartão {c.name} tem fatura em aberto. Passe a titularidade para outro
                          membro.
                        </p>
                        <select
                          aria-label={`Novo titular de ${c.name}`}
                          className={inputClass}
                          value={cardOwners[c.id] ?? ""}
                          onChange={(e) => setCardOwners((o) => ({ ...o, [c.id]: e.target.value }))}
                        >
                          <option value="">Escolha o novo titular</option>
                          {r.candidates.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <p>
                        1 cartão de {first} será arquivado ({c.name}).
                      </p>
                    )}
                  </li>
                ))}
                {r.planned.length > 0 ? (
                  <li data-testid="removal-planned">
                    {target.self ? (
                      <>
                        <p>
                          {r.planned.length} despesa(s) prevista(s) precisam de novo responsável.
                        </p>
                        <select
                          aria-label="Novo responsável pelas previstas"
                          className={inputClass}
                          value={plannedTo}
                          onChange={(e) => setPlannedTo(e.target.value)}
                        >
                          <option value="">Escolha um Administrador</option>
                          {r.candidates
                            .filter((c) => c.role === "ADMIN")
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </>
                    ) : (
                      <p>{r.planned.length} despesa prevista será passada para você.</p>
                    )}
                  </li>
                ) : null}
                {r.accounts.length === 0 &&
                r.cards.length === 0 &&
                r.planned.length === 0 &&
                !needsAck ? (
                  <li>Nenhuma pendência. O histórico é preservado com o nome.</li>
                ) : null}
              </ul>
              <Button disabled={!ready} onClick={() => setStep(2)}>
                Continuar
              </Button>
            </>
          ) : null}

          {r && step === 2 ? (
            <>
              <p className="text-sm text-slate-700">
                {target.self
                  ? "Você perde o acesso a esta família, mas o histórico permanece com o seu nome."
                  : `${first} perde o acesso agora; o histórico permanece com o nome dele(a) como ex-membro.`}{" "}
                Digite <strong>{expected}</strong> para confirmar.
              </p>
              <input
                aria-label="Confirmação"
                className={inputClass}
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
              />
              <Button
                variant="danger"
                disabled={confirmText.trim() !== expected || remove.isPending || !ready}
                onClick={submit}
              >
                {verb}
              </Button>
            </>
          ) : null}
          <Button variant="ghost" onClick={() => (step === 2 ? setStep(1) : onClose())}>
            {step === 2 ? "Voltar" : "Cancelar"}
          </Button>
        </div>
      ) : null}
    </Drawer>
  );
}
