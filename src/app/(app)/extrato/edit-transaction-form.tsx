"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyInput } from "@/components/money-input";
import {
  SplitModeSelector,
  type SplitModeValue,
  splitModeValid,
} from "@/components/split-mode-selector";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCategories } from "@/modules/categorias/hooks";
import { useAccounts } from "@/modules/contas/hooks";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";
import { customSharesOf, initialCustomPct } from "@/modules/split/custom-input";
import { formatBps } from "@/modules/split/rules";
import { normalizeTagKey } from "@/modules/tags/normalize";
import { useDefaults, useUpdateTransaction } from "@/modules/transacoes/hooks";
import {
  canChangeStructure,
  effectiveOwner,
  UNLINKED_PAYER_MESSAGE,
  UNLINKED_PAYER_SELF_MESSAGE,
} from "@/modules/transacoes/ownership";
import { type TransactionDetailDTO, UpdateTransactionSchema } from "@/modules/transacoes/schemas";

type FieldKey =
  | "amountInCents"
  | "accountId"
  | "categoryId"
  | "occurredOn"
  | "description"
  | "note"
  | "payerMemberId"
  | "tags"
  | "split";

export function EditTransactionForm({
  t,
  today,
  onDone,
  onConflict,
  onSettled,
}: {
  t: TransactionDetailDTO;
  today: string | undefined;
  onDone: () => void;
  onConflict: (message: string) => void;
  /** 409 SETTLED_PERIOD_CONFIRMATION_REQUIRED: o pai pede confirmação e reenvia. */
  onSettled: (message: string, resend: () => void) => void;
}) {
  const kind = t.type === "INCOME" ? "INCOME" : "EXPENSE";
  const accounts = useAccounts();
  const family = useFamily();
  const categories = useCategories(kind);
  const [cents, setCents] = useState(t.amountInCents);
  const [accountId, setAccountId] = useState(t.account?.id ?? "");
  const [categoryId, setCategoryId] = useState(t.category?.id ?? "");
  const [payerId, setPayerId] = useState(effectiveOwner(t.payer).id ?? "");
  const [shared, setShared] = useState(t.isSharedExpense);
  const defaults = useDefaults(true);
  // US-043: modo gravado; linha legada dividida sem modo vale "Pela regra"
  const [customOn, setCustomOn] = useState(t.split?.mode === "CUSTOM");
  const [customPct, setCustomPct] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (t.split?.mode === "CUSTOM" ? t.split.shares : []).map((s) => [
        s.member.id,
        formatBps(s.bps),
      ]),
    ),
  );
  const [date, setDate] = useState(t.occurredOn);
  const [description, setDescription] = useState(t.description);
  const [note, setNote] = useState(t.note ?? "");
  const [tags, setTags] = useState<string[]>(t.tags.map((x) => x.name)); // US-045
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const submitting = useRef(false);
  const update = useUpdateTransaction();

  // SEC-026: despesa "Só meu" é sempre em nome de quem edita (dono); para outra pessoa, divida.
  const myMemberId = family.data?.currentMemberId ?? "";
  // SEC-043/044: quem só controla o "Só meu" de outro não muda divisão, pagador nem conta (nem assume o pagamento)
  // SEC-049: quem voltou à família é o mesmo dono (o vínculo antigo aponta o vínculo ativo atual)
  const owner = effectiveOwner(t.payer);
  const ownerId = owner.id ?? t.author.id;
  // D-GES-55/59: o Administrador atual sobre o "Só meu" de ex-membro altera divisão, conta e "Pagar com" (não o pagador)
  const ownerGone = owner.removed;
  // US-093b (ADR-033 §5): o Administrador é o tutor do "Só meu" de dono ATIVO sem conta (mesmos poderes plenos)
  const payerUnlinked = Boolean(t.payer?.unlinked && !t.payer.removed);
  const fullPower = canChangeStructure(
    ownerId,
    { memberId: myMemberId, role: family.data?.currentRole },
    ownerGone,
    payerUnlinked,
  );
  const isAdmin = family.data?.currentRole === "ADMIN";
  const isAuthor = t.author.id === myMemberId;
  // SEC-059a (SDD-034 §4.8): pagador para/de sem conta só pelo lançador ou Administrador, nunca o Admin para si
  const lockUnlinkedPersonal = kind === "EXPENSE" && payerUnlinked && !t.isSharedExpense;
  const familyHasUnlinked = (family.data?.members ?? []).some((m) => m.unlinked);
  const unlinkedPayerHint = !payerUnlinked
    ? familyHasUnlinked && !isAuthor && !isAdmin
      ? UNLINKED_PAYER_MESSAGE
      : undefined
    : lockUnlinkedPersonal
      ? `O pagador só muda quando ${t.payer?.name.split(" ")[0] ?? "o membro"} entrar no app.`
      : !isAuthor && !isAdmin
        ? UNLINKED_PAYER_MESSAGE
        : !isAuthor
          ? UNLINKED_PAYER_SELF_MESSAGE
          : undefined;
  const lockUnlinkedForMember = kind === "EXPENSE" && payerUnlinked && !isAuthor && !isAdmin;
  const controllerOnly =
    kind === "EXPENSE" &&
    !t.isSharedExpense &&
    myMemberId !== "" &&
    ownerId !== myMemberId &&
    !fullPower;
  const personalExpense = kind === "EXPENSE" && !shared && myMemberId !== "";
  // D-GES-59 (SEC-048/051): o pagador ex-membro (que não voltou) é fixo para todos, inclusive o Administrador,
  // em "Só meu" e em dividida (a API também recusa)
  const lockGonePayer = kind === "EXPENSE" && ownerGone;
  const effectivePayerId =
    controllerOnly || lockGonePayer || lockUnlinkedPersonal || lockUnlinkedForMember
      ? ownerId
      : personalExpense
        ? myMemberId
        : payerId;

  const tagKeys = (list: string[]) => list.map(normalizeTagKey).sort().join("|");
  const tagsChanged = tagKeys(tags) !== tagKeys(t.tags.map((x) => x.name));

  const splitMode: SplitModeValue = !shared ? "NONE" : customOn ? "CUSTOM" : "RULE";
  const splitBefore: SplitModeValue = t.split?.mode ?? (t.isSharedExpense ? "RULE" : "NONE");
  const members = family.data?.members ?? [];
  const customShares = customSharesOf(members, customPct).shares;
  const splitBody =
    splitMode === "CUSTOM"
      ? { mode: "CUSTOM" as const, shares: customShares }
      : { mode: splitMode };
  const splitChanged =
    splitMode !== splitBefore ||
    (splitMode === "CUSTOM" &&
      customShares.some(
        (s) => (t.split?.shares.find((x) => x.member.id === s.memberId)?.bps ?? 0) !== s.bps,
      ));
  const splitInvalid = kind === "EXPENSE" && !splitModeValid(splitMode, members, customPct);

  function changeSplitMode(m: SplitModeValue) {
    if (controllerOnly) return;
    setShared(m !== "NONE");
    setCustomOn(m === "CUSTOM");
    setErrors((e) => ({ ...e, split: undefined }));
    if (m === "CUSTOM" && Object.keys(customPct).length === 0) {
      setCustomPct(initialCustomPct(members, defaults.data?.split.ruleShares));
    }
  }

  function payload(confirmSettledPeriod?: boolean) {
    const financialChanged =
      cents !== t.amountInCents ||
      (t.account !== null && accountId !== t.account.id) ||
      categoryId !== (t.category?.id ?? "") ||
      date !== t.occurredOn ||
      effectivePayerId !== (effectiveOwner(t.payer).id ?? "") ||
      description !== t.description ||
      (note.trim() === "" ? null : note) !== t.note ||
      (kind === "EXPENSE" && splitChanged);
    // SDD-016 §1: só as tags mudaram => edição NÃO financeira (não pede acerto, vale em fatura paga/parcela)
    if (tagsChanged && !financialChanged) return { version: t.version, tags };
    return {
      version: t.version,
      ...(t.account ? { accountId } : {}),
      categoryId,
      amountInCents: cents,
      occurredOn: date,
      payerMemberId: effectivePayerId,
      description,
      note: note.trim() === "" ? null : note,
      ...(kind === "EXPENSE" ? { split: splitBody } : {}),
      ...(tagsChanged ? { tags } : {}),
      ...(confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
    };
  }

  function fieldsFrom(issues: Array<{ path: string; message: string }>) {
    const out: Partial<Record<FieldKey, string>> = {};
    for (const i of issues) {
      const k = i.path.split(".")[0] as FieldKey;
      if (!out[k]) out[k] = i.message;
    }
    return out;
  }

  function send(confirmSettledPeriod?: boolean) {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    // O corpo mudou ao confirmar o mês acertado: nova chave (SDD-001 §5.2).
    if (confirmSettledPeriod) key.current = newIdempotencyKey();
    update.mutate(
      { id: t.id, input: payload(confirmSettledPeriod), idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Lançamento atualizado");
          onDone();
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT")
            onConflict(e.message);
          else if (e instanceof ApiClientError && e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED")
            onSettled(e.message, () => send(true));
          else if (e instanceof ApiClientError && Array.isArray(e.details)) {
            const next = fieldsFrom(e.details as Array<{ path: string; message: string }>);
            setErrors(next);
            if (Object.keys(next).length === 0) setBanner(e.message);
          } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  function submit() {
    const parsed = UpdateTransactionSchema.safeParse(payload());
    if (!parsed.success) {
      const next = fieldsFrom(
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
      setErrors(next);
      if (next.amountInCents) document.getElementById("ed-amount")?.focus();
      return;
    }
    setErrors({});
    send();
  }

  // A categoria atual pode ter sido arquivada depois do lançamento: continua selecionável.
  const activeCategories = categories.data?.items ?? [];
  const categoryOptions =
    t.category && !activeCategories.some((c) => c.id === t.category?.id)
      ? [
          {
            id: t.category.id,
            name: t.category.archived ? `${t.category.name} (arquivada)` : t.category.name,
          },
          ...activeCategories,
        ]
      : activeCategories;

  const select = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    options: Array<{ id: string; name: string; disabled?: boolean }>,
    error?: string,
    disabled?: boolean,
    hint?: string,
  ) => (
    <Field id={id} label={label} error={error} {...(hint ? { hint } : {})}>
      <select
        id={id}
        className={inputClass}
        disabled={disabled === true}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-invalid={error ? true : undefined}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={o.disabled === true}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );

  return (
    <form
      noValidate
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {banner ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      <Field id="ed-amount" label="Valor" error={errors.amountInCents}>
        <MoneyInput
          id="ed-amount"
          large
          autoFocus
          value={cents}
          onChange={setCents}
          invalid={Boolean(errors.amountInCents)}
          describedBy={errors.amountInCents ? "ed-amount-error" : undefined}
        />
      </Field>
      {t.card && !t.account ? (
        <Field
          id="ed-payment-source"
          label="Pagar com"
          hint="Para mudar a forma de pagamento, exclua e lance novamente"
        >
          <select id="ed-payment-source" className={inputClass} disabled value={t.card.id}>
            <option value={t.card.id}>{t.card.name}</option>
          </select>
        </Field>
      ) : (
        select(
          "ed-account",
          "Conta",
          accountId,
          setAccountId,
          accounts.data?.items ?? [],
          errors.accountId,
          controllerOnly,
        )
      )}
      {select(
        "ed-category",
        "Categoria",
        categoryId,
        setCategoryId,
        categoryOptions,
        errors.categoryId,
      )}
      {select(
        "ed-payer",
        kind === "INCOME" ? "Quem recebeu?" : "Quem pagou?",
        effectivePayerId,
        setPayerId,
        [
          ...(family.data?.members ?? [])
            .filter((m) =>
              controllerOnly || lockGonePayer || lockUnlinkedPersonal || lockUnlinkedForMember
                ? m.memberId === ownerId
                : !personalExpense || m.memberId === myMemberId,
            )
            .map((m) => ({
              id: m.memberId,
              name: memberOptionLabel({
                name: m.name.split(" ")[0] ?? m.name,
                unlinked: m.unlinked,
              }),
              // SEC-059a: sem ser o lançador, só o Administrador põe/tira o sem conta, e nunca a si mesmo
              disabled:
                !isAuthor &&
                m.memberId !== ownerId &&
                ((m.unlinked === true && !isAdmin) ||
                  (payerUnlinked && isAdmin && m.memberId === myMemberId)),
            })),
          // o pagador atual que saiu da família continua visível como opção atual (rotulada)
          ...(ownerGone &&
          t.payer &&
          !(family.data?.members ?? []).some((m) => m.memberId === ownerId)
            ? [
                {
                  id: t.payer.id,
                  name: `${t.payer.name.split(" ")[0] ?? t.payer.name} (ex-membro)`,
                },
              ]
            : []),
        ],
        errors.payerMemberId,
        controllerOnly || lockGonePayer || lockUnlinkedPersonal || lockUnlinkedForMember,
        unlinkedPayerHint,
      )}
      {kind === "EXPENSE" ? (
        <SplitModeSelector
          idPrefix="ed"
          mode={splitMode}
          onModeChange={changeSplitMode}
          ruleShares={defaults.data?.split.ruleShares}
          members={members}
          pct={customPct}
          onPctChange={(id, v) => setCustomPct((c) => ({ ...c, [id]: v }))}
          allowCustom={
            splitBefore === "CUSTOM" || (defaults.data?.split.modes ?? []).includes("CUSTOM")
          }
          serverError={errors.split}
        />
      ) : null}
      <Field id="ed-date" label="Data" error={errors.occurredOn}>
        <input
          id="ed-date"
          type="date"
          className={inputClass}
          value={date}
          {...(today ? { max: today } : {})}
          onChange={(e) => setDate(e.target.value)}
          aria-invalid={errors.occurredOn ? true : undefined}
        />
      </Field>
      <Field id="ed-description" label="Descrição" error={errors.description}>
        <input
          id="ed-description"
          className={inputClass}
          maxLength={100}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          aria-invalid={errors.description ? true : undefined}
        />
      </Field>
      <Field id="ed-note" label="Observação" error={errors.note}>
        <textarea
          id="ed-note"
          className={cn(inputClass, "min-h-20 py-2")}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <TagInput
        id="ed-tags"
        value={tags}
        onChange={(next) => {
          setTags(next);
          setErrors((x) => ({ ...x, tags: undefined }));
        }}
        error={errors.tags}
      />
      <Button type="submit" className="w-full" disabled={update.isPending || splitInvalid}>
        {update.isPending ? "Salvando…" : "Salvar alterações"}
      </Button>
    </form>
  );
}
