"use client";

import { Undo2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Money, useFormatMoney } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UnlinkedBadge } from "@/components/ui/unlinked-badge";
import { useFamily } from "@/modules/familia/hooks";
import { plannedCopy } from "@/modules/previstas/copy";
import { differenceLabel } from "@/modules/previstas/rules";
import type { PlannedExpenseDTO } from "@/modules/previstas/schemas";
import {
  canWritePlanned,
  canWriteTransaction,
  controllerNames,
  effectiveOwner,
  isUnlinkedActive,
  personalControllerIds,
  personalWriteMessage,
} from "@/modules/transacoes/ownership";
import { brDate, first, RecurringChip } from "./row-parts";

export function PaidRow({ item, onUndo }: { item: PlannedExpenseDTO; onUndo: () => void }) {
  const paid = item.paid;
  const fmt = useFormatMoney();
  const family = useFamily().data;
  const income = item.kind === "INCOME";
  const copy = plannedCopy(item.kind);
  // SEC-021: estornar a baixa de um "Só meu" é só do dono (quem pagou)
  const paidRow = paid
    ? {
        kind: income ? "INCOME" : "EXPENSE",
        isSharedExpense: item.isSharedExpense,
        payerMemberId: effectiveOwner(paid.payer).id,
        authorMemberId: paid.authorId ?? paid.payer.id,
        accountOwnerMemberId: paid.accountOwnerId ?? null,
      }
    : null;
  // US-051: desfazer o recebimento exige controle da receita prevista (a receita gerada não é "Só meu")
  const incomeControl =
    income &&
    (family === undefined ||
      canWritePlanned(
        {
          isSharedExpense: item.isSharedExpense,
          responsibleMemberId: effectiveOwner(item.responsible).id ?? "",
          authorMemberId: item.author.id,
          accountOwnerMemberId: item.paymentAccount?.ownerId ?? null,
        },
        { memberId: family.currentMemberId, role: family.currentRole },
        effectiveOwner(item.responsible).removed,
        isUnlinkedActive(item.responsible),
      ));
  const canUndo =
    !paid ||
    !paidRow ||
    (income
      ? incomeControl
      : family !== undefined &&
        canWriteTransaction(
          paidRow,
          { memberId: family.currentMemberId, role: family.currentRole },
          effectiveOwner(paid.payer).removed,
          isUnlinkedActive(paid.payer), // US-093b: tutor
        ));
  return (
    <li
      id={item.id}
      data-testid="paid-item"
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
          <CategoryIcon icon={item.category.icon} size={18} />
          <span className="truncate">{item.description}</span>
          {item.series ? <RecurringChip /> : null}
        </span>
        {paid ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            {income ? "Recebida" : "Pago"} em {brDate(paid.paidOn)}
          </span>
        ) : null}
      </div>
      {paid ? (
        <p className="text-sm text-slate-700" data-testid="paid-summary">
          Previsto <Money cents={item.amountInCents} /> · {income ? "Recebido" : "Pago"}{" "}
          <Money cents={paid.amountInCents} />
        </p>
      ) : null}
      {paid ? (
        <p data-testid="paid-difference" className="text-sm font-medium text-slate-700">
          {differenceLabel(paid.differenceInCents, fmt)}
        </p>
      ) : null}
      {canUndo ? (
        <div>
          <Button
            variant="secondary"
            aria-label={`${copy.undoAction} de ${item.description}`}
            onClick={onUndo}
          >
            <Undo2 size={16} aria-hidden="true" />
            {copy.undoAction}
          </Button>
        </div>
      ) : (
        <p data-testid="personal-readonly" className="text-xs text-slate-600">
          {paidRow && family
            ? personalWriteMessage(
                controllerNames(
                  personalControllerIds(paidRow),
                  family.members.map((m) => ({
                    id: m.memberId,
                    name: m.name,
                    unlinked: m.unlinked,
                  })),
                  { adminCan: isUnlinkedActive(paid?.payer) },
                ),
                " (Só meu)",
              )
            : ""}
        </p>
      )}
    </li>
  );
}
