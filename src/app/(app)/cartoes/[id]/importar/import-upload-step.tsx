"use client";

import Link from "next/link";
import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import type { AiFeatureStateDTO } from "@/modules/ia/dto";
import {
  isPdfPreview,
  type PdfPreviewDTO,
  useImportExtract,
  useImportPreview,
} from "@/modules/importacao/hooks";
import type { ImportDraft } from "@/modules/importacao/schemas";
import { importErrorMessage, isAiFailure } from "./import-errors";

export type InvoiceOption = { ref: string };

const UNAVAILABLE = "Indisponível: envie o CSV.";

function PdfNotice({
  pdf,
  feature,
  isAdmin,
}: {
  pdf: PdfPreviewDTO;
  feature: AiFeatureStateDTO | undefined;
  isAdmin: boolean;
}) {
  return (
    <section
      aria-label="O que vai à IA"
      className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p className="font-semibold">O conteúdo destas linhas vai à Anthropic (EUA)</p>
      <p>
        Inclui a descrição do estabelecimento como aparece no PDF. Nomes, CPF, e-mails, telefones e
        números de cartão já foram removidos.
      </p>
      {feature?.currentText ? <p>{feature.currentText.summary}</p> : null}
      {pdf.estimate && isAdmin ? (
        <p>
          Custo estimado: <Money cents={pdf.estimate.estimateInCents} />
        </p>
      ) : null}
      <ul
        data-testid="import-pdf-lines"
        className="max-h-64 overflow-y-auto rounded-lg border border-amber-200 bg-white p-2 font-mono text-xs text-slate-900"
      >
        {pdf.lines.map((l) => (
          <li key={l.ref} className="break-words">
            <span className="text-slate-500">{l.ref}</span> {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ImportUploadStep({
  cardId,
  refs,
  initialRef,
  feature,
  isAdmin,
  onDraft,
}: {
  cardId: string;
  refs: InvoiceOption[];
  initialRef: string;
  feature: AiFeatureStateDTO | undefined;
  isAdmin: boolean;
  onDraft: (draft: ImportDraft, file: File, invoiceRef: string) => void;
}) {
  const [ref, setRef] = useState(initialRef);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [pdf, setPdf] = useState<PdfPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = useImportPreview();
  const extract = useImportExtract();
  const aiOn = feature?.available === true && feature.state === "ON";
  const busy = preview.isPending || extract.isPending;
  const input = (f: File) => ({
    cardId,
    file: f,
    invoiceRef: ref,
    ...(password ? { password } : {}),
  });

  function reset() {
    setPdf(null);
    setError(null);
  }

  function send() {
    if (!file) return;
    reset();
    preview.mutate(input(file), {
      onSuccess: (r) => (isPdfPreview(r) ? setPdf(r) : onDraft(r, file, ref)),
      onError: (e) => setError(importErrorMessage(e)),
    });
  }

  function runExtract() {
    if (!file || !pdf) return;
    setError(null);
    extract.mutate(
      { ...input(file), previewHash: pdf.previewHash },
      {
        onSuccess: (d) => onDraft(d, file, ref),
        onError: (e) => setError(isAiFailure(e) ? UNAVAILABLE : importErrorMessage(e)),
      },
    );
  }

  const aiProblem = pdf && !aiOn;
  return (
    <div className="flex flex-col gap-4">
      <Field id="imp-ref" label="Fatura">
        <select
          id="imp-ref"
          className={inputClass}
          value={ref}
          disabled={busy}
          onChange={(e) => {
            setRef(e.target.value);
            reset();
          }}
        >
          {refs.map((r) => (
            <option key={r.ref} value={r.ref}>
              {formatInvoiceLabel(r.ref)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="imp-file" label="Arquivo da fatura (PDF ou CSV)">
        <input
          id="imp-file"
          type="file"
          accept=".pdf,.csv"
          className={inputClass}
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            reset();
          }}
        />
      </Field>
      <Field id="imp-pass" label="Senha do PDF (se houver)" hint="Usada só agora; não é guardada.">
        <input
          id="imp-pass"
          type="password"
          autoComplete="off"
          className={inputClass}
          value={password}
          disabled={busy}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {pdf && !aiProblem ? <PdfNotice pdf={pdf} feature={feature} isAdmin={isAdmin} /> : null}
      {aiProblem ? (
        <p role="alert" className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
          <span>{UNAVAILABLE}</span>
          {isAdmin && feature?.available ? (
            <>
              {" "}
              <Link href="/familia/ia" className="font-medium underline">
                Ligar a importação por IA
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {pdf && !aiProblem ? (
        <Button disabled={busy || !aiOn} onClick={runExtract}>
          {extract.isPending ? "Extraindo…" : "Extrair com IA"}
        </Button>
      ) : (
        <Button disabled={!file || busy} onClick={send}>
          {preview.isPending ? "Enviando…" : "Enviar arquivo"}
        </Button>
      )}
    </div>
  );
}
