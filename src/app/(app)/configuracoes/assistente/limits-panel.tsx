"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { inputClass } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAssistantLimits, usePutAssistantLimits } from "@/modules/mcp/hooks";
import {
  type AssistantLimitsDTO,
  DEFAULT_ASSISTANT_LIMITS,
  isRiskier,
} from "@/modules/mcp/limits-schemas";

// SDD-025 §8.2 / SDD-027 §R2.3 / US-076b: limites de lançamento do PRÓPRIO membro.
export const RISK_MSG_NO_LIMIT =
  "Sem limite, um erro ou uma instrução maliciosa da IA pode gerar muitos lançamentos indevidos.";
export const RISK_MSG_NO_BANK =
  "Este app não movimenta dinheiro em bancos reais, os lançamentos só alteram os registros do app.";

type Draft = { amount: number | null; day: number | null; hour: number | null };
type Field = keyof Draft;

const ROWS: Array<{
  field: Field;
  label: string;
  hint: string;
  testid: string;
  min: number;
  max: number;
  noLimit: string;
}> = [
  {
    field: "amount",
    label: "Valor máximo por lançamento",
    hint: "",
    testid: "limit-amount",
    min: 1,
    max: 0,
    noLimit: "Sem limite no valor por lançamento",
  },
  {
    field: "day",
    label: "Lançamentos por dia",
    hint: "De 1 a 200",
    testid: "limit-day",
    min: 1,
    max: 200,
    noLimit: "Sem limite de lançamentos por dia",
  },
  {
    field: "hour",
    label: "Lançamentos por hora",
    hint: "De 1 a 60 (janela de 60 minutos)",
    testid: "limit-hour",
    min: 1,
    max: 60,
    noLimit: "Sem limite de lançamentos por hora",
  },
];

const toDraft = (d: AssistantLimitsDTO): Draft => ({
  amount: d.maxAmountPerTxCents,
  day: d.maxTxPerDay,
  hour: d.maxTxPerHour,
});
const toLimits = (d: Draft) => ({
  maxAmountPerTxCents: d.amount,
  maxTxPerDay: d.day,
  maxTxPerHour: d.hour,
});
const DEFAULTS: Draft = {
  amount: DEFAULT_ASSISTANT_LIMITS.maxAmountPerTxCents,
  day: DEFAULT_ASSISTANT_LIMITS.maxTxPerDay,
  hour: DEFAULT_ASSISTANT_LIMITS.maxTxPerHour,
};

function RiskNotice() {
  return (
    <div
      data-testid="risk-notice"
      className="flex flex-col gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
    >
      <p>{RISK_MSG_NO_LIMIT}</p>
      <p>{RISK_MSG_NO_BANK}</p>
    </div>
  );
}

function Summary({ d }: { d: Draft }) {
  return (
    <ul data-testid="limits-summary" className="flex flex-col gap-1 text-sm text-slate-800">
      <li>
        {d.amount === null ? (
          "Sem limite por lançamento"
        ) : (
          <>
            <Money cents={d.amount} /> por lançamento
          </>
        )}
      </li>
      <li>
        {d.day === null ? "Sem limite de lançamentos por dia" : `${d.day} lançamentos por dia`}
      </li>
      <li>
        {d.hour === null ? "Sem limite de lançamentos por hora" : `${d.hour} lançamentos por hora`}
      </li>
    </ul>
  );
}

function LimitsForm({ data }: { data: AssistantLimitsDTO }) {
  const put = usePutAssistantLimits();
  const saved = toDraft(data);
  const [draft, setDraft] = useState<Draft>(saved);
  const [ack, setAck] = useState(false);
  const [removing, setRemoving] = useState<Field | null>(null);
  const [removeAck, setRemoveAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setAck(false);
    setError(null);
  };
  const dirty =
    draft.amount !== saved.amount || draft.day !== saved.day || draft.hour !== saved.hour;
  const risky = isRiskier(toLimits(draft));
  const fieldError = (r: (typeof ROWS)[number]): string | null => {
    const v = draft[r.field];
    if (v === null) return null;
    if (r.field === "amount") return v < 1 ? "Informe um valor maior que zero" : null;
    return v < r.min || v > r.max ? `Informe de ${r.min} a ${r.max}` : null;
  };
  const hasFieldError = ROWS.some((r) => fieldError(r) !== null);
  const canSave = dirty && !hasFieldError && (!risky || ack) && !put.isPending;

  function save() {
    if (!canSave) return;
    setError(null);
    put.mutate(
      {
        input: {
          ...toLimits(draft),
          ...(data.version !== null ? { version: data.version } : {}),
          riskAcknowledged: risky && ack,
        },
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          toast.success("Limites salvos");
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          setError(
            e instanceof ApiClientError || e instanceof NetworkError
              ? e.message
              : "Erro inesperado. Tente novamente.",
          );
        },
      },
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="limits-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <section aria-labelledby="limits-now" className="flex flex-col gap-2">
        <h3 id="limits-now" className="text-sm font-semibold text-slate-700">
          Limites atuais
        </h3>
        <Summary d={saved} />
        <p className="text-xs text-slate-600">
          Usados: {data.usage.today} hoje · {data.usage.lastHour} na última hora. Excluir um
          lançamento não devolve a cota.
        </p>
        <p className="text-xs text-slate-600">
          Valores sugeridos pelo app. Você pode mudar ou remover.
        </p>
      </section>

      {ROWS.map((r) => {
        const v = draft[r.field];
        const err = fieldError(r);
        const id = `limit-${r.field}`;
        return (
          <div
            key={r.field}
            data-testid={r.testid}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
          >
            <label htmlFor={id} className="text-sm font-medium text-slate-800">
              {r.label}
            </label>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                {r.field === "amount" ? (
                  <MoneyInput
                    id={id}
                    value={v ?? 0}
                    invalid={err !== null}
                    className={v === null ? "opacity-50" : ""}
                    onChange={(c) => v !== null && edit({ amount: c })}
                  />
                ) : (
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    disabled={v === null}
                    value={v === null ? "" : String(v)}
                    placeholder={v === null ? "Sem limite" : ""}
                    aria-invalid={err !== null ? true : undefined}
                    className={inputClass}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                      edit({ [r.field]: digits === "" ? 0 : Number(digits) } as Partial<Draft>);
                    }}
                  />
                )}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={v === null}
                aria-label={r.noLimit}
                onClick={() => {
                  if (v === null) {
                    edit({ [r.field]: DEFAULTS[r.field] } as Partial<Draft>);
                  } else {
                    setRemoveAck(false);
                    setRemoving(r.field);
                  }
                }}
                className="flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-slate-800"
              >
                <span
                  aria-hidden="true"
                  className={`relative block h-7 w-12 rounded-full transition-colors ${v === null ? "bg-red-700" : "bg-slate-300"}`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all dark:bg-slate-100 ${v === null ? "left-[22px]" : "left-0.5"}`}
                  />
                </span>
                Sem limite
              </button>
            </div>
            {err ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {err}
              </p>
            ) : r.hint ? (
              <p className="text-xs text-slate-500">{r.hint}</p>
            ) : null}
          </div>
        );
      })}

      {risky && dirty ? (
        <div className="flex flex-col gap-2">
          <RiskNotice />
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="checkbox"
              className="size-5"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            Entendi o risco
          </label>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSave}>
          {put.isPending ? "Salvando…" : "Salvar"}
        </Button>
        <Button
          variant="secondary"
          disabled={put.isPending}
          onClick={() => {
            setDraft(DEFAULTS);
            setAck(false);
            setError(null);
          }}
        >
          Restaurar sugeridos
        </Button>
      </div>

      <p className="text-xs text-slate-600">
        Limites de proteção do serviço (60 chamadas por minuto por conexão) não são configuráveis.
      </p>

      <Drawer
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remover este limite?"
      >
        <div className="flex flex-col gap-3">
          <RiskNotice />
          <p className="text-sm text-slate-800">
            Você continua podendo excluir lançamentos depois.
          </p>
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-900">
            <input
              type="checkbox"
              className="size-5"
              checked={removeAck}
              onChange={(e) => setRemoveAck(e.target.checked)}
            />
            Entendi o risco
          </label>
          <Button
            variant="danger"
            disabled={!removeAck}
            onClick={() => {
              if (!removing) return;
              setDraft((d) => ({ ...d, [removing]: null }));
              setAck(true);
              setError(null);
              setRemoving(null);
            }}
          >
            Remover limite
          </Button>
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Manter
          </Button>
        </div>
      </Drawer>
    </form>
  );
}

/** Aba "Limites de lançamento" (`#limites`). Cada membro configura só os seus. */
export function LimitsPanel() {
  const q = useAssistantLimits();
  if (q.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando limites" className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
        <Button variant="secondary" onClick={() => q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  return <LimitsForm key={q.data.version ?? 0} data={q.data} />;
}
