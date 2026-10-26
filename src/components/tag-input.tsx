"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/field";
import { useTags } from "@/modules/tags/hooks";
import {
  canonicalTagName,
  MAX_TAGS_PER_TRANSACTION,
  normalizeTagKey,
  SOFT_TAG_LIMIT,
} from "@/modules/tags/normalize";
import { TAG_MANY_MSG, TagNameSchema } from "@/modules/tags/schemas";

export const SOFT_LIMIT_MSG = "Muitas tags dificultam a análise";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Tags livres do lançamento (US-045, SDD-016 §6): linha recolhida "+ Tag" (sem foco automático, nunca atrasa
 * os quatro toques); ao abrir, chips removíveis, campo com sugestão por prefixo (200 ms) e "Criar tag 'x'".
 * Enter, vírgula ou sair do campo confirmam; a duplicata por chave reaproveita o nome já escolhido/existente.
 */
export function TagInput({
  value,
  onChange,
  error,
  id = "tx-tags",
  defaultOpen = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Erro vindo do servidor (nome inválido, mais de 20). */
  error?: string | undefined;
  id?: string;
  /** Já expandido (editor de tags do detalhe); no formulário de lançamento nasce recolhido. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || value.length > 0);
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | undefined>();
  const [active, setActive] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const q = useDebounced(normalizeTagKey(text), 200);
  const suggestions = useTags(q, { enabled: open && q.length > 0 });
  const chosen = new Set(value.map(normalizeTagKey));
  const options = (suggestions.data?.items ?? [])
    .filter((t) => normalizeTagKey(text) !== "" && !chosen.has(normalizeTagKey(t.name)))
    .slice(0, 8);
  const typedKey = normalizeTagKey(text);
  const parsed = text.trim() === "" ? null : TagNameSchema.safeParse(text);
  const exact = (suggestions.data?.items ?? []).find((t) => normalizeTagKey(t.name) === typedKey);
  const canCreate = parsed?.success === true && !exact && !chosen.has(typedKey);
  const rows: Array<{ kind: "existing" | "create"; name: string }> = [
    ...options.map((t) => ({ kind: "existing" as const, name: t.name })),
    ...(canCreate ? [{ kind: "create" as const, name: canonicalTagName(text) }] : []),
  ];
  const shown = open && text.trim() !== "" && rows.length > 0;

  /** Tenta acrescentar `raw` à lista `base`; devolve a lista nova e se deu certo (erro aparece no campo). */
  function tryAdd(raw: string, base: string[], fromOption = false) {
    const t = raw.trim();
    if (t === "") return { list: base, ok: true };
    const p = TagNameSchema.safeParse(t);
    if (!p.success) {
      setLocalError(p.error.issues[0]?.message);
      return { list: base, ok: false };
    }
    const key = normalizeTagKey(p.data);
    if (base.some((v) => normalizeTagKey(v) === key)) return { list: base, ok: true };
    if (base.length >= MAX_TAGS_PER_TRANSACTION) {
      setLocalError(TAG_MANY_MSG);
      return { list: base, ok: false };
    }
    // reaproveita o nome já existente (outra caixa/acento) quando a sugestão o conhece
    const known = fromOption
      ? p.data
      : ((suggestions.data?.items ?? []).find((s) => normalizeTagKey(s.name) === key)?.name ??
        canonicalTagName(p.data));
    return { list: [...base, known], ok: true };
  }

  function add(raw: string, fromOption = false) {
    const r = tryAdd(raw, value, fromOption);
    if (!r.ok) return false;
    if (r.list !== value) onChange(r.list);
    setText("");
    setLocalError(undefined);
    setActive(-1);
    return true;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && rows.length > 0) {
      e.preventDefault();
      setActive((a) => (a + 1) % rows.length);
    } else if (e.key === "ArrowUp" && rows.length > 0) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rows.length - 1 : a - 1));
    } else if (e.key === "Escape" && shown) {
      e.preventDefault();
      e.stopPropagation();
      setActive(-1);
      setText("");
    } else if (e.key === "Enter" || e.key === ",") {
      if (e.key === "Enter" && text.trim() === "") return; // Enter vazio segue o formulário
      e.preventDefault();
      const row = active >= 0 ? rows[active] : undefined;
      if (row) add(row.name, row.kind === "existing");
      else add(text);
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          id={id}
          onClick={() => {
            setOpen(true);
            // o foco só vai ao campo quando o membro pede (nunca ao abrir o formulário)
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          className="flex min-h-11 items-center self-start text-sm font-medium text-brand-800 dark:text-emerald-300 underline"
        >
          + Tag
        </button>
      </div>
    );
  }

  const shownError = localError ?? error;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-input`} className="text-sm font-medium text-slate-800">
        Tags
      </label>
      <div className="flex flex-wrap gap-2" data-testid="tag-chips">
        {value.map((name) => (
          <span
            key={normalizeTagKey(name)}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-slate-300 bg-slate-50 py-0.5 pl-3 pr-1 text-sm text-slate-800"
          >
            {name}
            <button
              type="button"
              aria-label={`Remover tag ${name}`}
              onClick={() =>
                onChange(value.filter((v) => normalizeTagKey(v) !== normalizeTagKey(name)))
              }
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200"
            >
              <X aria-hidden="true" size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id={`${id}-input`}
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? `${id}-error` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          placeholder="Digite e confirme com Enter ou vírgula"
          className={inputClass}
          value={text}
          onChange={(e) => {
            // a vírgula é o separador: colar "a,b" confirma "a" e segue em "b"
            const parts = e.target.value.split(",");
            if (parts.length > 1) {
              let list = value;
              let ok = true;
              for (const part of parts.slice(0, -1)) {
                const r = tryAdd(part, list);
                list = r.list;
                ok = r.ok && ok;
              }
              if (list !== value) onChange(list);
              if (ok) setLocalError(undefined);
              setText(ok ? (parts[parts.length - 1] ?? "") : e.target.value);
              return;
            }
            setText(e.target.value);
            setLocalError(undefined);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (text.trim() !== "") add(text);
          }}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Sugestões de tags"
          hidden={!shown}
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white dark:bg-slate-100 shadow-lg"
        >
          {rows.map((r, i) => (
            <li
              key={`${r.kind}-${r.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={active === i}
              tabIndex={-1}
              // mouseDown (e não click): o campo ainda não perdeu o foco, então o blur não confirma o texto antes
              onMouseDown={(e) => {
                e.preventDefault();
                add(r.name, r.kind === "existing");
                inputRef.current?.focus();
              }}
              className={cn(
                "flex min-h-11 cursor-pointer items-center px-3 text-sm",
                active === i ? "bg-brand-50" : "hover:bg-slate-50",
              )}
            >
              {r.kind === "create" ? `Criar tag '${r.name}'` : r.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="min-h-5" aria-live="polite">
        {shownError ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">
            {shownError}
          </p>
        ) : value.length > SOFT_TAG_LIMIT ? (
          <p role="status" className="text-xs text-amber-800 dark:text-amber-200">
            {SOFT_LIMIT_MSG}
          </p>
        ) : null}
      </div>
    </div>
  );
}
