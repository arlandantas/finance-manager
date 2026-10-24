"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, apiFetch } from "@/lib/http";

// SDD-025 §4.1 + §8.1: tela de consentimento do assistente (layout mínimo, sem navegação do app).
type Props = {
  requestId: string;
  clientName: string;
  redirectHost: string;
  redirectIsLoopback: boolean;
  knownHost: boolean;
  wantsWrite: boolean;
  /** Limites vigentes do membro ("Até R$ 500,00 por lançamento · 10 por dia · 5 por hora" ou "Sem limite"). */
  limitsText: string;
};

export function ConsentForm(p: Props) {
  const [label, setLabel] = useState(p.clientName.slice(0, 40));
  const [validityDays, setValidityDays] = useState<30 | 90>(30);
  const [allowWrite, setAllowWrite] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [writeAck, setWriteAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const canAllow = privacy && label.trim().length >= 2 && (!allowWrite || writeAck) && !submitting;

  async function decide(decision: "allow" | "deny") {
    setSubmitting(true);
    setError(null);
    try {
      const out = await apiFetch<{ redirectTo: string }>("/api/oauth/authorize/decision", {
        method: "POST",
        body:
          decision === "deny"
            ? { requestId: p.requestId, decision }
            : {
                requestId: p.requestId,
                decision,
                label: label.trim(),
                validityDays,
                allowWrite,
                privacyAcknowledged: true,
                ...(allowWrite ? { writeAcknowledged: true } : {}),
              },
      });
      window.location.assign(out.redirectTo);
    } catch (e) {
      setSubmitting(false);
      setError(
        e instanceof ApiClientError
          ? { code: e.code, message: e.message }
          : { code: "NETWORK", message: "Sem conexão. Tente de novo." },
      );
    }
  }

  if (error?.code === "ASSISTANT_BLOCKED") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        O Administrador bloqueou o acesso por assistente
      </p>
    );
  }
  if (error?.code === "REQUEST_EXPIRED" || error?.code === "NOT_FOUND") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
      >
        Este pedido de conexão expirou. Volte ao seu assistente e tente de novo.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (canAllow) void decide("allow");
      }}
    >
      <header className="flex flex-col gap-1">
        <h1 ref={titleRef} tabIndex={-1} className="text-xl font-bold text-slate-900">
          {p.clientName} quer acessar seus dados financeiros
        </h1>
        <p className="text-xs text-slate-500">Nome informado pelo aplicativo</p>
        <p className="text-sm text-slate-600">
          Vai voltar para <strong>{p.redirectHost}</strong>
        </p>
      </header>

      {p.redirectIsLoopback ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Este aplicativo roda no seu computador. Continue só se foi você que iniciou a conexão
          agora.
        </p>
      ) : !p.knownHost ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Aplicativo não reconhecido
        </p>
      ) : null}

      <p className="text-sm text-slate-700">
        Os dados que o assistente consultar serão enviados ao provedor da IA que você usa, fora do
        controle do app.
      </p>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-slate-900">
        <input
          type="checkbox"
          className="size-5"
          checked={privacy}
          onChange={(e) => setPrivacy(e.target.checked)}
        />
        Entendi
      </label>

      <Field id="consent-label" label="Nome da conexão">
        <TextInput
          id="consent-label"
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-800">Validade</legend>
        {([30, 90] as const).map((d) => (
          <label key={d} className="flex min-h-11 items-center gap-2 text-sm text-slate-900">
            <input
              type="radio"
              name="validity"
              className="size-5"
              checked={validityDays === d}
              onChange={() => setValidityDays(d)}
            />
            {d} dias
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-800">Permissões</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-900">
          <input type="checkbox" className="size-5" checked disabled readOnly />
          Consultar saldos, gastos e extrato
        </label>
        {p.wantsWrite ? (
          <>
            <label className="flex min-h-11 items-start gap-2 text-sm text-slate-900">
              <input
                type="checkbox"
                className="mt-0.5 size-5"
                checked={allowWrite}
                onChange={(e) => {
                  setAllowWrite(e.target.checked);
                  if (!e.target.checked) setWriteAck(false);
                }}
              />
              <span>
                Lançar despesas em seu nome (sem confirmação)
                <span className="block text-xs text-slate-600">
                  Só despesas à vista &quot;Só meu&quot;, dentro dos seus limites de lançamento.
                </span>
              </span>
            </label>
            {allowWrite ? (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>
                  O assistente grava lançamentos direto, sem pedir sua confirmação. Você poderá
                  excluí-los depois.
                </p>
                <p data-testid="consent-limits">
                  Seus limites: {p.limitsText}.{" "}
                  <a
                    href="/configuracoes/assistente#limites"
                    target="_blank"
                    rel="noopener"
                    className="font-semibold underline"
                  >
                    Alterar limites
                  </a>
                </p>
                <label className="flex min-h-11 items-start gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5"
                    checked={writeAck}
                    onChange={(e) => setWriteAck(e.target.checked)}
                  />
                  Entendi que o assistente pode lançar sem minha confirmação
                </label>
              </div>
            ) : null}
          </>
        ) : null}
      </fieldset>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={!canAllow} className="flex-1">
          {submitting ? "Conectando…" : "Permitir"}
        </Button>
        <Button
          variant="secondary"
          disabled={submitting}
          onClick={() => void decide("deny")}
          className="flex-1"
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
