"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { AiFeatureStateDTO } from "@/modules/ia/dto";
import { useDisableConsent, useEnableConsent } from "@/modules/ia/hooks";

const LABEL: Record<AiFeatureStateDTO["purpose"], string> = {
  SPENDING_ANALYSIS: "Análise de gastos",
  INVOICE_IMPORT: "Importar faturas",
};

const SP_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function errorText(e: unknown): string {
  if (e instanceof ApiClientError || e instanceof NetworkError) return e.message;
  return "Erro inesperado. Tente novamente.";
}

/**
 * Interruptor de consentimento por finalidade (SDD-022 §6). Sem atualização otimista: o estado só muda
 * com a resposta 200. Ligar abre o texto vigente e exige "Entendi e quero ligar"; desligar pede confirmação.
 */
export function ConsentSwitch({
  feature,
  canEdit,
  familyVersion,
}: {
  feature: AiFeatureStateDTO;
  canEdit: boolean;
  familyVersion: number;
}) {
  const enable = useEnableConsent();
  const disable = useDisableConsent();
  const [asking, setAsking] = useState<"enable" | "disable" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const on = feature.state === "ON";
  const label = LABEL[feature.purpose];
  const busy = enable.isPending || disable.isPending;
  const labelId = `ai-switch-${feature.purpose}`;

  function close() {
    setAsking(null);
    setShowDetails(false);
    setError(null);
  }

  function confirm() {
    if (busy) return;
    setError(null);
    const done = (msg: string) => () => {
      keyRef.current = newIdempotencyKey();
      close();
      toast.success(msg);
    };
    const fail = (e: unknown) => {
      keyRef.current = newIdempotencyKey(); // erro de negócio não fica gravado: o reenvio usa chave nova
      setError(errorText(e));
    };
    if (asking === "enable") {
      enable.mutate(
        {
          purpose: feature.purpose,
          textVersion: feature.currentText.version,
          familyVersion,
          idempotencyKey: keyRef.current,
        },
        { onSuccess: done(`${label} ligada`), onError: fail },
      );
    } else {
      disable.mutate(
        { purpose: feature.purpose, familyVersion, idempotencyKey: keyRef.current },
        { onSuccess: done(`${label} desligada`), onError: fail },
      );
    }
  }

  const last = feature.lastChange;
  return (
    <div
      data-testid="ai-feature"
      data-purpose={feature.purpose}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id={labelId} className="font-medium text-slate-900">
            {label}
          </p>
          {feature.state === "UNAVAILABLE" ? (
            <p className="text-xs text-slate-500">A IA ainda não está disponível</p>
          ) : null}
          {feature.state === "NEEDS_RECONSENT" ? (
            <p data-testid="ai-reconsent" className="text-xs font-medium text-amber-800">
              O texto mudou: confirme de novo
            </p>
          ) : null}
          {!canEdit && feature.state !== "UNAVAILABLE" ? (
            <p className="text-xs text-slate-500">Só o Administrador pode ligar ou desligar</p>
          ) : null}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          disabled={!canEdit || feature.state === "UNAVAILABLE" || busy}
          onClick={() => setAsking(on ? "disable" : "enable")}
          className="flex min-h-11 min-w-12 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-7 w-12 rounded-full transition-colors ${on ? "bg-brand-700" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all dark:bg-slate-100 ${on ? "left-[22px]" : "left-0.5"}`}
            />
          </span>
        </button>
      </div>
      <p className="text-sm text-slate-700">{feature.currentText.summary}</p>
      {last ? (
        <p data-testid="ai-last-change" className="text-xs text-slate-500">
          {last.action === "ENABLED" ? "Ligado" : "Desligado"} por{" "}
          {last.by.former ? `${last.by.name} (ex-membro)` : last.by.name} em{" "}
          {SP_DATE.format(new Date(last.at))}
        </p>
      ) : null}

      <Drawer
        open={asking === "enable"}
        onOpenChange={(o) => !o && close()}
        title={`Ligar ${label.toLowerCase()}?`}
      >
        <div className="flex flex-col gap-3">
          <p data-testid="ai-consent-text" className="text-sm text-slate-800">
            {feature.currentText.summary}
          </p>
          <Button variant="ghost" onClick={() => setShowDetails((v) => !v)}>
            Ver como tratamos seus dados
          </Button>
          {showDetails ? (
            <ul data-testid="ai-consent-details" className="list-disc pl-5 text-sm text-slate-700">
              {feature.currentText.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button disabled={busy} onClick={confirm}>
            Entendi e quero ligar
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={asking === "disable"}
        onOpenChange={(o) => !o && close()}
        title={`Desligar ${label.toLowerCase()}?`}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-800">Vale na hora e não apaga o que já foi analisado.</p>
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button variant="danger" disabled={busy} onClick={confirm}>
            Desligar
          </Button>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
