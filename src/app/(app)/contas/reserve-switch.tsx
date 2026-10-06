"use client";

/** US-057: interruptor "Não conta no saldo disponível" (conta continua movimentável). */
export function ReserveSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input
          type="checkbox"
          role="switch"
          data-testid="reserve-switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="reserve-switch-help"
          className="h-5 w-5 accent-brand-700"
        />
        Não conta no saldo disponível
      </label>
      <p id="reserve-switch-help" className="text-sm text-slate-600">
        Use para reservas e poupanças: a conta continua recebendo e enviando transferências, mas o
        valor aparece separado em "Reservas".
      </p>
    </div>
  );
}
