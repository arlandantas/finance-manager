"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import { accountDeletedAction } from "@/app/actions";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useRemovalReview } from "@/modules/familia/hooks";

const LAST_ADMIN = "Passe a administração para outra pessoa antes de excluir sua conta.";
const SOLE_MEMBER =
  "Você é a única pessoa na família. Exclua a família antes de excluir sua conta.";

/**
 * US-080: página de confirmação (não um modal). Lista o que acontece, mostra as pendências da saída da família
 * (US-035) quando há e só habilita o botão com o e-mail da conta digitado. O servidor repete todas as checagens.
 */
export function ExcluirContaScreen({
  email,
  memberId,
  familyName,
}: {
  email: string;
  memberId: string | null;
  familyName: string | null;
}) {
  const review = useRemovalReview(memberId, true);
  const r = review.data;
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [cardOwners, setCardOwners] = useState<Record<string, string>>({});
  const [plannedTo, setPlannedTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const submitting = useRef(false);

  const soleMember = r?.blockers.includes("ONLY_MEMBER") ?? false;
  const lastAdmin = !soleMember && (r?.blockers.includes("LAST_ADMIN") ?? false);
  const needsAck = (r?.settlement.enabled ?? false) && (r?.settlement.totalInCents ?? 0) > 0;
  const admins = (r?.candidates ?? []).filter((c) => c.role === "ADMIN");
  const pendingOwners = (r?.accounts ?? []).filter((a) => a.mustReassign && !owners[a.id]);
  const pendingCards = (r?.cards ?? []).filter((c) => c.mustReassign && !cardOwners[c.id]);
  const plannedNeedsPick = (r?.planned.length ?? 0) > 0 && !plannedTo;
  const reviewReady =
    memberId === null ||
    (r !== undefined &&
      !soleMember &&
      !lastAdmin &&
      pendingOwners.length === 0 &&
      pendingCards.length === 0 &&
      (!needsAck || ack) &&
      !plannedNeedsPick);
  const emailOk = confirm.trim().toLowerCase() === email.toLowerCase();

  const del = useMutation({
    networkMode: "always", // offline: tenta e falha com a mensagem, em vez de ficar pausado
    mutationFn: () =>
      apiFetch<{ deleted: true }>("/api/v1/me/delete-account", {
        method: "POST",
        idempotencyKey: keyRef.current,
        body: {
          confirmEmail: confirm.trim(),
          acknowledgeSettlement: ack,
          reassign: {
            accounts: owners,
            cards: cardOwners,
            ...(plannedTo ? { plannedTo } : {}),
          },
        },
      }),
    onSuccess: async () => {
      await accountDeletedAction(); // apaga os cookies deste aparelho e vai para "Sua conta foi excluída"
    },
    onError: (e) => {
      keyRef.current = newIdempotencyKey();
      submitting.current = false;
      if (e instanceof NetworkError) setError("Sem conexão. Nada foi excluído. Tente de novo.");
      else if (e instanceof ApiClientError) setError(e.message);
      else setError("Erro inesperado. Tente novamente.");
    },
  });

  const onDelete = () => {
    if (submitting.current || !emailOk || !reviewReady) return; // duplo clique: uma exclusão só
    submitting.current = true;
    setError(null);
    del.mutate();
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Excluir minha conta</h1>
      </header>

      <section
        aria-labelledby="o-que-acontece"
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:bg-slate-100"
      >
        <h2 id="o-que-acontece" className="text-lg font-semibold text-slate-900">
          O que acontece
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-800">
          <li>
            {familyName
              ? `Você sai da ${familyName} (mesmas regras e revisão de pendências da saída).`
              : "Você não está em nenhuma família agora."}
          </li>
          <li>
            Os acessos de assistente são revogados e todas as sessões, em todos os aparelhos, são
            encerradas.
          </li>
          <li>Seu nome, e-mail e foto são apagados: seu nome vira “Conta excluída”.</li>
          <li>
            Os lançamentos e acertos que você fez permanecem na família e aparecem como “ex-membro
            (conta excluída)”.
          </li>
        </ol>
        <p className="text-sm font-medium text-slate-900">
          Isso é definitivo: entrar de novo com o mesmo Google cria uma conta nova e vazia.
        </p>
        <p className="text-sm text-slate-700">
          <Link
            href="/perfil"
            className="font-semibold text-brand-800 underline dark:text-emerald-300"
          >
            Baixar meus dados antes
          </Link>
        </p>
      </section>

      {memberId !== null && review.isPending ? (
        <p className="text-sm text-slate-600">Carregando revisão…</p>
      ) : null}
      {memberId !== null && review.isError ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          Não foi possível carregar a revisão. Recarregue a página.
        </p>
      ) : null}

      {soleMember ? (
        <div
          role="alert"
          data-testid="exclusao-bloqueada"
          className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          <p>{SOLE_MEMBER}</p>
          <Link href="/familia/excluir" className="underline">
            Excluir a família
          </Link>
        </div>
      ) : null}
      {lastAdmin ? (
        <p
          role="alert"
          data-testid="exclusao-bloqueada"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
        >
          {LAST_ADMIN}
        </p>
      ) : null}

      {r && !soleMember && !lastAdmin ? (
        <ul className="flex flex-col gap-3 text-sm text-slate-800" data-testid="removal-review">
          {needsAck ? (
            <li>
              <p>
                Há <Money cents={r.settlement.totalInCents} /> a acertar entre vocês. A diferença
                continua registrada no histórico.
              </p>
              <label className="mt-1 flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                Reconheço a diferença
              </label>
            </li>
          ) : null}
          {r.accounts.map((a) =>
            a.mustReassign ? (
              <li key={a.id} data-testid="removal-account">
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
              </li>
            ) : (
              <li key={a.id}>A conta {a.name} será arquivada.</li>
            ),
          )}
          {r.cards.map((c) =>
            c.mustReassign ? (
              <li key={c.id} data-testid="removal-card">
                <p>
                  O cartão {c.name} tem fatura em aberto. Passe a titularidade para outro membro.
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
              </li>
            ) : (
              <li key={c.id}>O cartão {c.name} será arquivado.</li>
            ),
          )}
          {r.planned.length > 0 ? (
            <li data-testid="removal-planned">
              <p>{r.planned.length} despesa(s) prevista(s) precisam de novo responsável.</p>
              <select
                aria-label="Novo responsável pelas previstas"
                className={inputClass}
                value={plannedTo}
                onChange={(e) => setPlannedTo(e.target.value)}
              >
                <option value="">Escolha um Administrador</option>
                {admins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </li>
          ) : null}
        </ul>
      ) : null}

      <section className="flex flex-col gap-3">
        <label htmlFor="confirm-email" className="text-sm font-medium text-slate-800">
          Digite seu e-mail para confirmar
        </label>
        <input
          id="confirm-email"
          type="email"
          autoComplete="off"
          className={inputClass}
          placeholder={email}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="danger"
            data-testid="excluir-conta"
            disabled={!emailOk || !reviewReady || del.isPending}
            onClick={onDelete}
          >
            {del.isPending ? "Excluindo…" : "Excluir minha conta"}
          </Button>
          <Link
            href="/perfil"
            className="inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Cancelar
          </Link>
        </div>
      </section>
    </div>
  );
}
