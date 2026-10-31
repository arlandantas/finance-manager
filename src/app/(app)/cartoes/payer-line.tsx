import { Landmark } from "lucide-react";
import type { CardDTO } from "@/modules/cartoes/schemas";

/** US-089: "Paga pela {conta}" (texto, não só ícone); arquivada = aviso com ícone + texto (NEED-017). */
export function PayerLine({ card, className }: { card: CardDTO; className?: string }) {
  const a = card.paymentAccount;
  if (!a) return null;
  return (
    <p
      data-testid="card-payer"
      className={`flex items-center gap-1.5 text-sm text-slate-700 ${className ?? ""}`}
    >
      <Landmark size={14} aria-hidden="true" />
      {a.archived ? `Conta pagadora arquivada (${a.name})` : `Paga pela ${a.name}`}
    </p>
  );
}
