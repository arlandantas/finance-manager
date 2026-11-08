"use client";

import { History, ListOrdered, Pencil, RotateCcw, Tag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { InstallmentPlanDialog } from "@/components/installment-plan-dialog";
import { Money } from "@/components/money";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { UnlinkedBadge } from "@/components/ui/unlinked-badge";
import { UndoTransferDialog } from "@/components/undo-transfer-dialog";
import { memberLabel } from "@/lib/deleted-account";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useUndoInvoicePayment } from "@/modules/cartoes/hooks";
import { useFamily } from "@/modules/familia/hooks";
import { plannedCopy } from "@/modules/previstas/copy";
import {
  useDefaults,
  useInstallmentPlan,
  useTransactionDetail,
  useTransactionState,
} from "@/modules/transacoes/hooks";
import {
  canWriteTransaction,
  controllerNames,
  effectiveOwner,
  isUnlinkedActive,
  personalControllerIds,
  personalWriteMessage,
} from "@/modules/transacoes/ownership";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";
import { DetailDialogs } from "./detail-dialogs";
import { EditInstallmentForm } from "./edit-installment-form";
import { EditTagsForm } from "./edit-tags-form";
import { EditTransactionForm } from "./edit-transaction-form";
import { HistoryList } from "./history-list";
import { DetailFields } from "./transaction-detail-fields";

/** Desktop (>= 1024): painel lateral à direita; abaixo disso, gaveta/modal (SDD-010 §4.6). */
const SIDE_PANEL =
  "lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:h-full lg:max-h-none lg:w-[440px] lg:max-w-none lg:translate-x-0 lg:translate-y-0 lg:rounded-none lg:rounded-l-2xl";

type Mode = "view" | "edit" | "history" | "tags";

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
  // US-040b/041: parcela edita/exclui só em fatura aberta; a compra inteira se vê/exclui pelo diálogo do plano
  const [planDialog, setPlanDialog] = useState<{ confirm: boolean } | null>(null);
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

  const installment = t?.installment ?? null;
  const planQuery = useInstallmentPlan(installment?.planId ?? null);
  const parcel = planQuery.data?.plan.installments.find((p) => p.no === installment?.no);
  const editable = t && (t.type === "EXPENSE" || t.type === "INCOME") && !installment;
  // US-041: parcela em fatura aberta edita e exclui; fechada/paga só mostra o motivo
  const planDto = planQuery.data?.plan;
  const parcelOpen = Boolean(parcel && parcel.state === "ACTIVE" && !parcel.locked && planDto);
  const parcelRestorable = Boolean(
    parcel &&
      parcel.state === "REMOVED" &&
      parcel.lockedReason !== "INVOICE_PAID" &&
      !planDto?.deleted,
  );
  const tagsEditable = t && (t.type === "EXPENSE" || t.type === "INCOME");
  const family = useFamily().data;
  // SEC-021 / D-GES-50: "Só meu" é alterado por quem controla (pagador, dono da conta e lançador)
  const ownershipRow = t
    ? {
        kind: t.type,
        isSharedExpense: t.isSharedExpense,
        payerMemberId: effectiveOwner(t.payer).id,
        authorMemberId: t.author.id,
        accountOwnerMemberId: t.accountOwnerId ?? null,
      }
    : null;
  const canWrite =
    !t ||
    !ownershipRow ||
    (family !== undefined &&
      canWriteTransaction(
        ownershipRow,
        { memberId: family.currentMemberId, role: family.currentRole },
        effectiveOwner(t.payer).removed,
        isUnlinkedActive(t.payer), // US-093b: tutor
      ));
  const ownerGone = effectiveOwner(t?.payer).removed;
  const controlLine =
    ownershipRow && family
      ? ownerGone
        ? canWrite
          ? `Pago por ${t?.payer?.name} (ex-membro): como Administrador, você pode alterar este lançamento "Só meu".`
          : `Pago por ${t?.payer?.name} (ex-membro): este lançamento "Só meu" é somente leitura (só o Administrador pode alterá-lo).`
        : personalWriteMessage(
            controllerNames(
              personalControllerIds(ownershipRow),
              family.members.map((m) => ({ id: m.memberId, name: m.name, unlinked: m.unlinked })),
              { adminCan: isUnlinkedActive(t?.payer) },
            ),
            " (Só meu)",
          )
      : "";
  const readOnlyPersonal = Boolean(t && !canWrite);
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
            const label = after.installment
              ? "Parcela excluída"
              : after.type === "INCOME"
                ? "Receita excluída"
                : "Despesa excluída";
            toast.success(label, {
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
      : mode === "tags"
        ? "Editar tags"
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

        {t && mode === "edit" && installment && planDto ? (
          <EditInstallmentForm
            t={t}
            planVersion={planDto.version}
            onDone={() => setMode("view")}
            onConflict={setConflictMsg}
            onSettled={(message, resend) => setSettled({ message, resend })}
          />
        ) : null}

        {t && mode === "edit" && !installment ? (
          <EditTransactionForm
            t={t}
            today={defaults.data?.today}
            onDone={() => setMode("view")}
            onConflict={setConflictMsg}
            onSettled={(message, resend) => setSettled({ message, resend })}
          />
        ) : null}

        {t && mode === "tags" ? (
          <EditTagsForm t={t} onDone={() => setMode("view")} onConflict={setConflictMsg} />
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
              {t.deletedAt &&
              t.deletionReason === "DELETED" &&
              (editable || parcelRestorable) &&
              canWrite ? (
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
              {(editable || parcelOpen) && canWrite && !t.deletedAt ? (
                <Button variant="secondary" onClick={() => setMode("edit")}>
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </Button>
              ) : null}
              {/* US-045: editar só as tags não é financeiro: vale em parcela, fatura paga e conta arquivada */}
              {tagsEditable && canWrite && !t.deletedAt ? (
                <Button variant="secondary" onClick={() => setMode("tags")}>
                  <Tag size={16} aria-hidden="true" />
                  Editar tags
                </Button>
              ) : null}
              {editable && canWrite && !t.deletedAt && !t.plannedExpenseId ? (
                <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  Excluir
                </Button>
              ) : null}
              {installment && !t.deletedAt ? (
                <>
                  <Button variant="secondary" onClick={() => setPlanDialog({ confirm: false })}>
                    <ListOrdered size={16} aria-hidden="true" />
                    Ver compra
                  </Button>
                  {!canWrite ? null : parcel?.lockedReason ? (
                    <span
                      data-testid="installment-paid"
                      className="text-sm font-medium text-slate-600"
                    >
                      {parcel.lockedReason === "INVOICE_PAID" ? "Fatura paga" : "Fatura fechada"}
                    </span>
                  ) : parcelOpen ? (
                    <>
                      <Button variant="secondary" onClick={() => setConfirmingDelete(true)}>
                        <Trash2 size={16} aria-hidden="true" />
                        Excluir parcela
                      </Button>
                      <Button variant="secondary" onClick={() => setPlanDialog({ confirm: true })}>
                        <Trash2 size={16} aria-hidden="true" />
                        Excluir compra parcelada
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
              {editable || installment ? (
                <Button variant="secondary" onClick={() => setMode("history")}>
                  <History size={16} aria-hidden="true" />
                  Histórico
                </Button>
              ) : null}
            </div>
            {readOnlyPersonal ? (
              <p
                data-testid="personal-readonly"
                className="mb-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"
              >
                <strong>{t?.payer?.name ?? t?.author.name}</strong>, "Só meu": {controlLine}
              </p>
            ) : null}
            <DetailFields t={t} installment={installment} />
            {t.plannedExpenseId && !t.deletedAt ? (
              <p
                data-testid="linked-planned"
                className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800"
              >
                <span>{plannedCopy(isIncome ? "INCOME" : "EXPENSE").linkedToPlanned}</span>{" "}
                <Link
                  href={`/previstas${isIncome ? "?tab=pagas" : ""}#${t.plannedExpenseId}`}
                  className="font-medium text-brand-800 dark:text-emerald-300 underline"
                >
                  {isIncome ? "Ver receita prevista" : "Ver despesa prevista"}
                </Link>
              </p>
            ) : null}
            <div className="mt-3 flex flex-col gap-1 text-sm text-slate-700">
              {t.payer ? (
                <p>
                  {isIncome ? "Recebido por" : "Pago por"} <strong>{memberLabel(t.payer)}</strong>
                  {t.payer.unlinked && !t.payer.removed ? (
                    <UnlinkedBadge className="ml-1 px-1.5 py-0.5 text-[11px]" />
                  ) : null}
                </p>
              ) : null}
              <p>
                Registrado por <strong>{memberLabel(t.author)}</strong>
              </p>
              {t.viaAssistant ? (
                <p data-testid="detail-via-assistant">
                  Lançado via assistente: <strong>{t.viaAssistant.label}</strong>
                </p>
              ) : null}
              {t.isInvoiceImport ? (
                <p data-testid="detail-invoice-import">Importado da fatura</p>
              ) : null}
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

      <InstallmentPlanDialog
        planId={planDialog && installment ? installment.planId : null}
        startConfirming={planDialog?.confirm ?? false}
        onClose={() => setPlanDialog(null)}
        onDeleted={onClose}
      />

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

      <DetailDialogs
        confirmingDelete={confirmingDelete}
        onConfirmingDelete={setConfirmingDelete}
        deleting={del.isPending}
        isParcel={installment !== null}
        onDelete={() => t && runState("delete", t)}
        conflictMsg={conflictMsg}
        onCloseConflict={() => setConflictMsg(null)}
        onReload={async () => {
          setConflictMsg(null);
          setMode("view");
          await detail.refetch();
        }}
        settled={settled}
        onCloseSettled={() => setSettled(null)}
      />
    </>
  );
}
