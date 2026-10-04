"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money";
import { useTransactionDetail } from "@/modules/transacoes/hooks";

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

export function TransactionDetailDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const detail = useTransactionDetail(id && !id.startsWith("pending-") ? id : null);
  const t = detail.data?.transaction;
  const isIncome = t?.type === "INCOME";
  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Detalhe do lançamento"
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
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => detail.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {t ? (
        <dl>
          <Row label="Valor">
            {t.direction === "CREDIT" ? "+" : "-"}
            {formatBRL(t.amountInCents)}
          </Row>
          <Row label="Descrição">{t.description}</Row>
          <Row label="Data">{brDate(t.occurredOn)}</Row>
          {t.category ? <Row label="Categoria">{t.category.name}</Row> : null}
          <Row label="Conta">{t.account.name}</Row>
          {t.type === "EXPENSE" ? (
            <Row label="Divisão">{t.isSharedExpense ? "Despesa comum" : "Despesa pessoal"}</Row>
          ) : null}
          {t.note ? <Row label="Observação">{t.note}</Row> : null}
          {t.deletedAt ? (
            <Row label="Situação">{t.deletionReason === "UNDONE" ? "Desfeito" : "Excluído"}</Row>
          ) : null}
        </dl>
      ) : null}
      {t ? (
        <div className="mt-3 flex flex-col gap-1 text-sm text-slate-700">
          {t.payer ? (
            <p>
              {isIncome ? "Recebido por" : "Pago por"} <strong>{t.payer.name}</strong>
            </p>
          ) : null}
          <p>
            Registrado por <strong>{t.author.name}</strong>
          </p>
          {t.editedBy ? (
            <p>
              Editado por <strong>{t.editedBy.name}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}
