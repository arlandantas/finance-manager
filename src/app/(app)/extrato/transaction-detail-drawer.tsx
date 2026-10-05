"use client";

import { History, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { UndoTransferDialog } from "@/components/undo-transfer-dialog";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useUndoInvoicePayment } from "@/modules/cartoes/hooks";
import { useDefaults, useTransactionDetail, useTransactionState } from "@/modules/transacoes/hooks";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";
import { EditTransactionForm } from "./edit-transaction-form";
import { HistoryList } from "./history-list";

function brDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Desktop (>= 1024): painel lateral à direita; abaixo disso, gaveta/modal (SDD-010 §4.6). */
const SIDE_PANEL =
  "lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:max-h-none lg:w-[440px] lg:max-w-none lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:rounded-l-2xl";

type Mode = "view" | "edit" | "history";

export function TransactionDetailDrawer({
  id,
  onClose,
  source = "extrato",
}: {
  id: string | null;
  onClose: () => void;
  source?: "home" | "extrato";
}) {
  const detail = useTransactionDetail(id && !id.startsWith("pending-") ? id : null);
  const defaults = useDefaults(id !== null);
  const t = detail.data?.transaction;
  const [mode, setMode] = useState<Mode>("view");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [settled, setSettled] = useState<{ message: string; resend: () => void } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoingPayment, setUndoingPayment] = useState(false);
  const undoPayment = useUndoInvoicePayment();
  const del = useTransactionState("delete");
  const restore = useTransactionState("restore");
  const stateKey = useRef(newIdempotencyKey());

  useEffect(() => {
    if (id) {
      setMode("view");
      setConfirmingDelete(false);
      setConflictMsg(null);
      setSettled(null);
      setBanner(null);
    }
  }, [id]);

  const editable = t && (t.type === "EXPENSE" || t.type === "INCOME");
  const isLeg = t && (t.type === "TRANSFER_OUT" || t.type === "TRANSFER_IN");
  const isPayment = t?.type === "INVOICE_PAYMENT";

  function runUndoPayment(current: TransactionDetailDTO) {
    if (!current.card || !current.invoice) return;
    undoPayment.mutate(
      {
        cardId: current.card.id,
        ref: current.invoice.ref,
        version: current.version,
        idempotencyKey: newIdempotencyKey(),
      },
      {
        onSuccess: () => {
          setUndoingPayment(false);
          toast.success("Pagamento desfeito");
          onClose();
        },
        onError: (e) => {
          setUndoingPayment(false);
          if (e instanceof ApiClientError || e instanceof NetworkError) setBanner(e.message);
          else setBanner("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  function runState(
    action: "delete" | "restore",
    current: TransactionDetailDTO,
    confirmSettledPeriod?: boolean,
  ) {
    const mutation = action === "delete" ? del : restore;
    stateKey.current = newIdempotencyKey();
    mutation.mutate(
      {
        id: current.id,
        input: {
          version: current.version,
          ...(confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
        },
        idempotencyKey: stateKey.current,
      },
      {
        onSuccess: (res) => {
          setConfirmingDelete(false);
          setSettled(null);
          if (action === "delete") {
            const after = res.transaction;
            toast.success(after.type === "INCOME" ? "Receita excluída" : "Despesa excluída", {
              duration: 8000, // SDD-010 §4.6: "Desfazer" visível por pelo menos 8 s
              action: {
                label: "Desfazer",
                onClick: () => restoreFromToast(after),
              },
            });
            onClose();
          } else toast.success("Lançamento restaurado");
        },
        onError: (e) => {
          setConfirmingDelete(false);
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT")
            setConflictMsg(e.message);
          else if (e instanceof ApiClientError && e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED")
            setSettled({ message: e.message, resend: () => runState(action, current, true) });
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  function restoreFromToast(after: TransactionDetailDTO) {
    restore.mutate(
      { id: after.id, input: { version: after.version }, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: () => toast.success("Lançamento restaurado"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível desfazer"),
      },
    );
  }

  const title =
    mode === "edit"
      ? "Editar lançamento"
      : mode === "history"
        ? "Histórico"
        : "Detalhe do lançamento";
  const isIncome = t?.type === "INCOME";
  return (
    <>
      <Drawer
        open={id !== null}
        onOpenChange={(open) => !open && onClose()}
        title={title}
        className={SIDE_PANEL}
      >
        {detail.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : null}
        {detail.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
            <Button variant="secondary" onClick={() => detail.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : null}
        {banner ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {banner}
          </p>
        ) : null}

        {t && mode === "edit" ? (
          <EditTransactionForm
            t={t}
            today={defaults.data?.today}
            onDone={() => setMode("view")}
            onConflict={setConflictMsg}
            onSettled={(message, resend) => setSettled({ message, resend })}
          />
        ) : null}

        {t && mode === "history" ? (
          <div className="flex flex-col gap-3">
            <HistoryList id={t.id} />
            <Button variant="secondary" onClick={() => setMode("view")}>
              Voltar ao detalhe
            </Button>
          </div>
        ) : null}

        {t && mode === "view" ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
              {t.deletedAt && t.deletionReason === "DELETED" && editable ? (
                <Button
                  variant="secondary"
                  disabled={restore.isPending}
                  onClick={() => runState("restore", t)}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                  Restaurar
                </Button>
              ) : null}
              {isPayment && !t.deletedAt ? (
                <Button variant="secondary" onClick={() => setUndoingPayment(true)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  Desfazer pagamento
                </Button>
              ) : null}
              {isLeg && t.transferGroupId && !t.deletedAt ? (
                <Button variant="secondary" onClick={() => setUndoing(true)}>
                  <RotateCcw size={16} aria-hidden="true" />
                  {t.isSettlement ? "Desfazer acerto" : "Desfazer transferência"}
                </Button>
              ) : null}
              {editable && !t.deletedAt ? (
                <Button variant="secondary" onClick={() => setMode("edit")}>
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </Button>
              ) : null}
              {editable && !t.deletedAt && !t.plannedExpenseId ? (
                <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Excluir
                </Button>
              ) : null}
              {editable ? (
                <Button variant="secondary" onClick={() => setMode("history")}>
                  <History size={16} aria-hidden="true" />
                  Histórico
                </Button>
              ) : null}
            </div>
            <dl>
              <Row label="Valor">
                {t.direction === "CREDIT" ? "+" : "-"}
                <Money cents={t.amountInCents} />
              </Row>
              <Row label="Descrição">{t.description}</Row>
              <Row label="Data">{brDate(t.occurredOn)}</Row>
              {t.category ? (
                <Row label="Categoria">
                  {t.category.archived ? `${t.category.name} (arquivada)` : t.category.name}
                </Row>
              ) : null}
              {t.account ? <Row label="Conta">{t.account.name}</Row> : null}
              {t.card ? <Row label="Cartão">{t.card.name}</Row> : null}
              {t.invoice ? (
                <Row label="Fatura">
                  {formatInvoiceLabel(t.invoice.ref)} · fecha {brDate(t.invoice.closingDate)} ·
                  vence {brDate(t.invoice.dueDate)}
                </Row>
              ) : null}
              {t.type === "EXPENSE" ? (
                <Row label="Divisão">{t.isSharedExpense ? "Dividida com a família" : "Só meu"}</Row>
              ) : null}
              {t.note ? <Row label="Observação">{t.note}</Row> : null}
              {t.deletedAt ? (
                <Row label="Situação">
                  {t.deletionReason === "UNDONE" ? "Desfeito" : "Excluído"}
                </Row>
              ) : null}
            </dl>
            {t.plannedExpenseId && !t.deletedAt ? (
              <p
                data-testid="linked-planned"
                className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"
              >
                <span>Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.</span>{" "}
                <Link
                  href={`/previstas#${t.plannedExpenseId}`}
                  className="font-medium text-brand-800 dark:text-emerald-300 underline"
                >
                  Ver despesa prevista
                </Link>
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-1 text-sm text-slate-700">
              {t.payer ? (
                <p>
                  {isIncome ? "Recebido por" : "Pago por"} <strong>{t.payer.name}</strong>
                  {t.payer.removed ? " (ex-membro)" : ""}
                </p>
              ) : null}
              <p>
                Registrado por <strong>{t.author.name}</strong>
              </p>
              {source === "home" ? (
                <Link
                  href={`/extrato?period=${t.occurredOn.slice(0, 7)}&highlight=${t.id}`}
                  className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand-800 dark:text-emerald-300 underline"
                >
                  Ver no Extrato
                </Link>
              ) : null}
              {t.editedBy ? (
                <p>
                  Editado por <strong>{t.editedBy.name}</strong>
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </Drawer>

      <UndoTransferDialog
        groupId={undoing && t?.transferGroupId ? t.transferGroupId : null}
        isSettlement={Boolean(t?.isSettlement)}
        onClose={() => setUndoing(false)}
        onDone={onClose}
      />

      <Drawer open={undoingPayment} onOpenChange={setUndoingPayment} title="Desfazer pagamento?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            O valor volta para a conta e a fatura volta a ficar em aberto para pagamento.
          </p>
          <Button
            variant="danger"
            disabled={undoPayment.isPending}
            onClick={() => t && runUndoPayment(t)}
          >
            {undoPayment.isPending ? "Desfazendo…" : "Desfazer pagamento"}
          </Button>
          <Button variant="ghost" onClick={() => setUndoingPayment(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Excluir lançamento?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            O lançamento sai dos saldos e totais, mas continua no histórico e pode ser restaurado.
          </p>
          <Button
            variant="danger"
            disabled={del.isPending}
            onClick={() => t && runState("delete", t)}
          >
            {del.isPending ? "Excluindo…" : "Excluir"}
          </Button>
          <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={conflictMsg !== null}
        onOpenChange={(o) => !o && setConflictMsg(null)}
        title="Lançamento alterado"
      >
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflictMsg}
          </p>
          <Button
            onClick={async () => {
              setConflictMsg(null);
              setMode("view");
              await detail.refetch();
            }}
          >
            Recarregar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={settled !== null}
        onOpenChange={(o) => !o && setSettled(null)}
        title="Mês já acertado"
      >
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {settled?.message}
          </p>
          <Button
            onClick={() => {
              const go = settled?.resend;
              setSettled(null);
              go?.();
            }}
          >
            Confirmar mesmo assim
          </Button>
          <Button variant="ghost" onClick={() => setSettled(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </>
  );
}
