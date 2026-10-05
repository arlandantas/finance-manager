"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { MoneyInput } from "@/components/money-input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { usePutSplitRule, useRulePreview, useSplitRule } from "@/modules/split/hooks";
import { suggestBpsFromIncomes } from "@/modules/split/preview";
import { equalShares, formatBps, formatBpsList, parsePercentToBps } from "@/modules/split/rules";
import type { SplitRuleDTO } from "@/modules/split/schemas";
import { DisabledNotice, isDisabled } from "../acerto-screen";

const RANGE_MSG = "Informe um percentual entre 0% e 100%";
const SUM_MSG = "Os percentuais precisam somar 100%";

type Kind = "EQUAL" | "PROPORTIONAL";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;

function Form({ rule }: { rule: SplitRuleDTO }) {
  const equal = equalShares(rule.members.map((m, i) => ({ id: m.id, ordinal: i })));
  const initialKind: Kind = rule.current.kind;
  const initialValues = (() => {
    const base = rule.current.kind === "PROPORTIONAL" ? rule.current.shares : equal;
    return Object.fromEntries(
      rule.members.map((m) => [m.id, formatBps(base.find((s) => s.memberId === m.id)?.bps ?? 0)]),
    );
  })();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sumError, setSumError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const put = usePutSplitRule(key);
  const parsed = rule.members.map((m) => parsePercentToBps(values[m.id] ?? ""));
  const total = parsed.reduce<number>((s, v) => s + (v ?? 0), 0);
  const readOnly = !rule.canEdit;
  const equalLabel = `Dividir igualmente (${formatBpsList(equal)})`;
  const router = useRouter();
  const [incomes, setIncomes] = useState<Record<string, number>>({});
  const [incomeError, setIncomeError] = useState<string | null>(null);

  // Prévia (US-031): só com entrada válida, com debounce de 300 ms
  const sumOk = kind === "EQUAL" || (parsed.every((v) => v !== null) && total === 10000);
  const previewInput = (() => {
    if (readOnly || !sumOk) return null;
    if (kind === "EQUAL") return { kind: "EQUAL" as const };
    return {
      kind: "PROPORTIONAL" as const,
      shares: rule.members.map((m, i) => ({ memberId: m.id, bps: parsed[i] as number })),
    };
  })();
  const previewKey = JSON.stringify(previewInput);
  const [debouncedKey, setDebouncedKey] = useState(previewKey);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(previewKey), 300);
    return () => clearTimeout(t);
  }, [previewKey]);
  const preview = useRulePreview(debouncedKey === previewKey ? previewInput : null);

  function suggest() {
    try {
      const out = suggestBpsFromIncomes(
        rule.members.map((m, i) => ({
          memberId: m.id,
          ordinal: i,
          incomeInCents: incomes[m.id] ?? 0,
        })),
      );
      setKind("PROPORTIONAL");
      setValues(Object.fromEntries(out.map((s) => [s.memberId, formatBps(s.bps)])));
      setIncomeError(null);
      setSumError(null);
      setFieldErrors({});
    } catch {
      setIncomeError("Informe as rendas");
    }
  }

  function submit() {
    if (submitting.current || readOnly) return;
    setBanner(null);
    if (kind === "EQUAL") {
      send({ kind: "EQUAL", ...(effectiveFrom ? { effectiveFrom } : {}) });
      return;
    }
    const errs: Record<string, string> = {};
    rule.members.forEach((m, i) => {
      if (parsed[i] === null) errs[m.id] = RANGE_MSG;
    });
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setSumError(null);
      document.getElementById(`pct-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    if (total !== 10000) {
      setSumError(SUM_MSG);
      return;
    }
    setSumError(null);
    send({
      kind: "PROPORTIONAL",
      shares: rule.members.map((m, i) => ({ memberId: m.id, bps: parsed[i] as number })),
      ...(effectiveFrom ? { effectiveFrom } : {}),
    });
  }

  function send(input: Parameters<typeof put.mutate>[0]) {
    submitting.current = true;
    put.mutate(input, {
      onSuccess: () => {
        toast.success("Regra de divisão atualizada");
        setKey(newIdempotencyKey());
        router.push("/acerto");
      },
      onError: (e) => {
        if (e instanceof NetworkError) setBanner(e.message);
        else if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR")
          setSumError(e.message);
        else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
      },
      onSettled: () => {
        submitting.current = false;
      },
    });
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {rule.stale && rule.canEdit ? (
        <p
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          Um novo membro entrou. Redefina os percentuais.
        </p>
      ) : null}
      {readOnly ? (
        <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">
          Somente Administradores podem alterar a regra. Você vê a regra em modo somente leitura.
        </p>
      ) : null}
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-2" disabled={readOnly}>
        <legend className="mb-1 text-sm font-medium text-slate-800">
          Como dividir as despesas comuns
        </legend>
        {(["EQUAL", "PROPORTIONAL"] as const).map((k) => (
          <label
            key={k}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm font-medium",
              kind === k
                ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                : "border-slate-200 bg-white dark:bg-slate-100 text-slate-800",
            )}
          >
            <input
              type="radio"
              name="split-kind"
              value={k}
              checked={kind === k}
              onChange={() => {
                setKind(k);
                setSumError(null);
                setFieldErrors({});
              }}
              className="h-5 w-5 accent-brand-700"
            />
            {k === "EQUAL" ? equalLabel : "Proporcional"}
          </label>
        ))}
      </fieldset>

      {kind === "PROPORTIONAL" ? (
        <section aria-label="Percentuais por membro" className="flex flex-col gap-3">
          {rule.members.map((m) => (
            <Field
              key={m.id}
              id={`pct-${m.id}`}
              label={`Percentual de ${m.name.split(" ")[0]}`}
              error={fieldErrors[m.id]}
            >
              <div className="flex items-center gap-3">
                <Avatar name={m.name} image={m.image} size={32} />
                <input
                  id={`pct-${m.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={readOnly}
                  className={inputClass}
                  value={values[m.id] ?? ""}
                  aria-invalid={fieldErrors[m.id] ? true : undefined}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [m.id]: e.target.value.replace(/%/g, "") }));
                    setFieldErrors((f) => ({ ...f, [m.id]: "" }));
                    setSumError(null);
                  }}
                />
                <span aria-hidden="true" className="text-slate-600">
                  %
                </span>
              </div>
            </Field>
          ))}
          <p
            data-testid="split-total"
            aria-live="polite"
            className={cn(
              "text-sm font-semibold",
              total === 10000 ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700",
            )}
          >
            Total: {formatBps(total)}%
          </p>
          {sumError || (parsed.every((v) => v !== null) && total !== 10000) ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {sumError ?? SUM_MSG}
            </p>
          ) : null}
        </section>
      ) : null}

      {preview.data ? (
        <section
          aria-label="Prévia"
          data-testid="rule-preview"
          className="flex flex-col gap-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-700"
        >
          <p data-testid="preview-effective">
            Vale a partir de {preview.data.effectiveFrom.split("-").reverse().join("/")}.
            Lançamentos anteriores não mudam.
          </p>
          <p data-testid="preview-impact">
            Impacto no acerto de {monthName(preview.data.period.key)}:{" "}
            <Money cents={preview.data.impactInCents} />
          </p>
        </section>
      ) : (
        <p className="text-sm text-slate-600">A mudança vale a partir de agora.</p>
      )}

      {!readOnly ? (
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
            Sugerir pela renda
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {rule.members.map((m) => (
              <Field key={m.id} id={`inc-${m.id}`} label={`Renda de ${m.name.split(" ")[0]}`}>
                <MoneyInput
                  id={`inc-${m.id}`}
                  value={incomes[m.id] ?? 0}
                  onChange={(c) => setIncomes((v) => ({ ...v, [m.id]: c }))}
                />
              </Field>
            ))}
            <p className="text-xs text-slate-500">As rendas informadas não são guardadas</p>
            {incomeError ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {incomeError}
              </p>
            ) : null}
            <Button type="button" variant="secondary" onClick={suggest}>
              Sugerir pela renda
            </Button>
          </div>
        </details>
      ) : null}

      {!readOnly ? (
        <>
          <details className="rounded-lg border border-slate-200 p-3">
            <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
              Mais detalhes
            </summary>
            <div className="mt-3">
              <Field
                id="split-effective-from"
                label="Vigência"
                hint="Padrão: hoje. Meses já encerrados nunca são recalculados."
              >
                <input
                  id="split-effective-from"
                  type="date"
                  className={inputClass}
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                />
              </Field>
            </div>
          </details>
          <Button
            type="submit"
            disabled={
              put.isPending ||
              (kind === "PROPORTIONAL" && parsed.every((v) => v !== null) && total !== 10000)
            }
          >
            {put.isPending ? "Salvando…" : "Salvar regra"}
          </Button>
        </>
      ) : null}

      {rule.upcoming.length > 0 ? (
        <section aria-label="Regras futuras" className="flex flex-col gap-1 text-sm text-slate-600">
          {rule.upcoming.map((u) => (
            <p key={u.id}>
              A partir de {u.effectiveFrom.split("-").reverse().join("/")}:{" "}
              {u.kind === "EQUAL" ? "divisão igual" : formatBpsList(u.shares)}
            </p>
          ))}
        </section>
      ) : null}
    </form>
  );
}

export function RegraScreen() {
  const rule = useSplitRule();
  const [formKey, setFormKey] = useState(0);
  // Reinicia o formulário quando a regra do servidor muda (nova versão salva).
  const version = rule.data ? `${rule.data.current.id}:${rule.data.upcoming.length}` : "";
  useEffect(() => {
    if (version) setFormKey((k) => k + 1);
  }, [version]);

  return (
    <main className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Link
          href="/acerto"
          aria-label="Voltar ao acerto de contas"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Regra de divisão</h1>
      </header>
      {rule.isPending ? (
        <div aria-busy="true" aria-label="Carregando regra" className="flex flex-col gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : null}
      {rule.isError && isDisabled(rule.error) ? <DisabledNotice /> : null}
      {rule.isError && !isDisabled(rule.error) ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => rule.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {rule.data ? <Form key={formKey} rule={rule.data} /> : null}
    </main>
  );
}
