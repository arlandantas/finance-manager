"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreatePat } from "@/modules/mcp/hooks";

// US-074c (ADR-043): gerar token pessoal. O valor vive só no estado deste diálogo: some ao fechar, nunca vai a
// URL, localStorage, cache de rota ou log do cliente.
const DAYS = [7, 30, 90] as const;
type Days = (typeof DAYS)[number];

function errorText(e: unknown): string {
  if (e instanceof ApiClientError || e instanceof NetworkError) return e.message;
  return "Erro inesperado. Tente novamente.";
}

function TokenResult({ value, onDone }: { value: string | null; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Token copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o token e copie manualmente.");
    }
  }
  if (!value) {
    return (
      <div className="flex flex-col gap-3" data-testid="pat-redacted">
        <p className="text-sm text-slate-800">
          Este token já foi criado, mas o valor não pode ser mostrado de novo. Revogue e gere outro.
        </p>
        <Button onClick={onDone}>Fechar</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3" data-testid="pat-result">
      <p
        role="alert"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
      >
        Copie agora: este token não será mostrado de novo. Guarde-o só no arquivo de configuração do
        seu cliente e revogue se suspeitar de vazamento.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          aria-label="Token pessoal"
          data-testid="pat-value"
          value={value}
          autoComplete="off"
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 font-mono text-sm text-slate-900 dark:bg-slate-200"
        />
        <Button variant="secondary" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          Copiar
        </Button>
      </div>
      <Button onClick={onDone}>Já copiei</Button>
    </div>
  );
}

export function PatDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreatePat();
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<Days>(30);
  const [allowWrite, setAllowWrite] = useState(false);
  const [writeAck, setWriteAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ token: string | null } | null>(null);
  const keyRef = useRef(newIdempotencyKey());

  function close() {
    setLabel("");
    setDays(30);
    setAllowWrite(false);
    setWriteAck(false);
    setError(null);
    setCreated(null);
    create.reset();
    keyRef.current = newIdempotencyKey();
    onOpenChange(false);
  }

  const ready = label.trim().length > 0 && (!allowWrite || writeAck);

  function submit() {
    setError(null);
    create.mutate(
      { label, validityDays: days, allowWrite, idempotencyKey: keyRef.current },
      {
        onSuccess: (r) => {
          keyRef.current = newIdempotencyKey();
          setCreated({ token: r.token ?? null });
          create.reset();
        },
        onError: (e) => {
          // 5xx/rede: a mesma chave faz o replay seguro; erro de regra: nova chave
          if (!(e instanceof NetworkError)) keyRef.current = newIdempotencyKey();
          setError(errorText(e));
        },
      },
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title="Gerar token pessoal"
    >
      {created ? (
        <TokenResult value={created.token} onDone={close} />
      ) : (
        <form
          className="flex flex-col gap-3"
          data-testid="pat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && !create.isPending) submit();
          }}
        >
          <p className="text-sm text-slate-800">
            Para IDEs, terminais e programas que não fazem login pelo navegador. Quem tiver o token
            acessa seus dados até ele vencer ou ser revogado.
          </p>
          <Field
            id="pat-label"
            label="Nome do token"
            hint="Ex.: Cursor no notebook (até 40 letras)"
          >
            <TextInput
              id="pat-label"
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field id="pat-days" label="Validade">
            <select
              id="pat-days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as Days)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:bg-slate-100"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </Field>
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
              Permitir lançamento
              <span className="block text-xs text-slate-600">
                Só despesas à vista &quot;Só meu&quot;, dentro dos seus limites. O token novo já
                nasce com confirmação no app.
              </span>
            </span>
          </label>
          {allowWrite ? (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200">
              <p>
                O assistente grava lançamentos em seu nome. Você poderá excluí-los depois e pode
                revogar o token a qualquer momento.
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
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={!ready || create.isPending}>
            Gerar token
          </Button>
          <Button type="button" variant="ghost" onClick={close}>
            Cancelar
          </Button>
        </form>
      )}
    </Drawer>
  );
}
