import {
  type CreateRecurringExpenseInput,
  CreateRecurringExpenseSchema,
} from "@/modules/previstas/recurring-schemas";
import {
  type CreatePlannedExpenseInput,
  CreatePlannedExpenseSchema,
} from "@/modules/previstas/schemas";
import { type CreateTransactionInput, CreateTransactionSchema } from "@/modules/transacoes/schemas";

/**
 * Porta única "Já aconteceu / Vai acontecer" (US-090) e "Repetir todo mês" (US-091), SDD-031.
 * Módulo PURO (sem React, sem relógio): traduz o estado do formulário em `{ service, input }`. Cada serviço
 * é o de hoje, com o mesmo corpo; nenhuma regra financeira nasce aqui.
 */

export type DoorKind = "EXPENSE" | "INCOME"; // US-100 acrescenta "TRANSFER"
export type DoorWhen = "NOW" | "LATER"; // US-096 acrescenta "SUBSCRIPTION"
export type DoorRepeat = "NONE" | "MONTHLY"; // só vale com LATER
export type DoorService = "TRANSACTION" | "PLANNED" | "SERIES";

export type DoorState = {
  kind: DoorKind;
  when: DoorWhen;
  repeat: DoorRepeat;
  cents: number;
  description: string;
  categoryId: string;
  /** "acc:<id>" | "card:<id>" | "" (cartão só em NOW/EXPENSE). */
  source: string;
  /** Pagador (NOW) = responsável (LATER). */
  payerId: string;
  shared: boolean;
  sharedTouched: boolean;
  /** "" = padrão do servidor (hoje). */
  date: string;
  note: string;
  tags: string[];
  installments: number;
  paidBeforeApp: number;
  /** NOW + cartão + parcelas já pagas: data âncora da fatura fechada escolhida ("" = fatura aberta). */
  paidAnchorOn: string;
  /** SERIES: valores efetivos (o formulário já aplicou os padrões derivados da data). */
  day: string;
  startMonth: string;
  endKind: "NONE" | "COUNT";
  endMonths: string;
};

export type DoorCtx = {
  today: string;
  me: string;
  splitAvailable: boolean;
  /** Parcelado com divisão ainda indisponível (US-042): não envia `isSharedExpense`. Só vale em NOW. */
  splitBlocked: boolean;
  flags: { incomePlanned: boolean };
};

/** Ponto de extensão da US-051: liga a receita prevista sem reescrever a porta. */
export const DOOR_FLAGS = { incomePlanned: false } as const;

/** Padrão por modo em tabela (D-TL-U7-4): hoje os dois modos nascem "Só meu". */
export const MODE_DEFAULTS: Record<DoorWhen, { shared: boolean }> = {
  NOW: { shared: false },
  LATER: { shared: false },
};

/** Registro de serviços por `kind × when × repeat` (D-TL-U7-2). */
export const DOOR_SERVICES: Record<string, DoorService> = {
  "EXPENSE|NOW|NONE": "TRANSACTION",
  "INCOME|NOW|NONE": "TRANSACTION",
  "EXPENSE|LATER|NONE": "PLANNED",
  "EXPENSE|LATER|MONTHLY": "SERIES",
};

export const SERIES_ACCOUNT_MSG = "Séries exigem conta de pagamento";
export const FUTURE_DATE_MSG = "A data não pode ser futura";
export const CARD_LATER_HINT = "No cartão, use Assinatura (todo mês)";
export const INCOME_LATER_HINT = "Receita prevista ainda não está disponível";
export const SERIES_NOTE_NOTICE =
  "A observação não é guardada em séries; ela volta se você desmarcar Repetir";

export function serviceOf(
  s: Pick<DoorState, "kind" | "when" | "repeat">,
  flags: DoorCtx["flags"] = DOOR_FLAGS,
): DoorService | null {
  if (s.when === "NOW") return DOOR_SERVICES[`${s.kind}|NOW|NONE`] ?? null;
  if (s.kind === "INCOME") return flags.incomePlanned ? "PLANNED" : null;
  return DOOR_SERVICES[`${s.kind}|LATER|${s.repeat}`] ?? null;
}

export function availability(
  s: Pick<DoorState, "kind" | "source">,
  ctx: Pick<DoorCtx, "flags">,
): {
  later: { enabled: boolean; reason?: "CARD_SELECTED" | "INCOME_NOT_AVAILABLE" };
  repeat: { enabled: boolean };
} {
  let later: { enabled: boolean; reason?: "CARD_SELECTED" | "INCOME_NOT_AVAILABLE" } = {
    enabled: true,
  };
  if (s.kind === "INCOME") {
    if (!ctx.flags.incomePlanned) later = { enabled: false, reason: "INCOME_NOT_AVAILABLE" };
  } else if (s.source.startsWith("card:")) {
    later = { enabled: false, reason: "CARD_SELECTED" };
  }
  return { later, repeat: { enabled: later.enabled && s.kind === "EXPENSE" } };
}

export function laterHint(reason: "CARD_SELECTED" | "INCOME_NOT_AVAILABLE" | undefined) {
  return reason === "CARD_SELECTED"
    ? CARD_LATER_HINT
    : reason === "INCOME_NOT_AVAILABLE"
      ? INCOME_LATER_HINT
      : undefined;
}

/** "A data não pode ser futura" só vale em "Já aconteceu"; em "Vai acontecer" o vencimento pode ser futuro. */
export function validateDateForWhen(date: string, when: DoorWhen, today: string): string | null {
  return when === "NOW" && date !== "" && today !== "" && date > today ? FUTURE_DATE_MSG : null;
}

/** O valor "sujo" de "Dividir" não é reposto na troca de modo; o "limpo" recebe o padrão do modo. */
export function sharedAfterModeChange(
  s: Pick<DoorState, "shared" | "sharedTouched">,
  next: DoorWhen,
): boolean {
  return s.sharedTouched ? s.shared : MODE_DEFAULTS[next].shared;
}

export function effectLine(when: DoorWhen, repeat: DoorRepeat): string {
  if (when === "NOW") return "Já aconteceu: entra no extrato e nos saldos agora";
  const base = "Vai acontecer: fica em A pagar até você dar baixa; não muda saldo nem extrato";
  return repeat === "MONTHLY"
    ? `${base}. Cria uma série mensal; as próximas 12 aparecem em A pagar`
    : base;
}

export function saveLabel(s: Pick<DoorState, "kind" | "when">): string {
  if (s.when === "LATER") return "Salvar previsão";
  return s.kind === "INCOME" ? "Salvar receita" : "Salvar despesa";
}

/** Dia/mês padrão da série: derivados da data digitada (senão de hoje). */
export function seriesDefaults(date: string, today: string) {
  const base = date || today;
  return {
    day: base ? String(Number(base.slice(8, 10))) : "",
    startMonth: base ? base.slice(0, 7) : "",
  };
}

function sharedOf(s: DoorState, ctx: DoorCtx): boolean {
  if (s.kind !== "EXPENSE") return false;
  return ctx.splitAvailable && s.shared && !(s.when === "NOW" && ctx.splitBlocked);
}

/** SEC-026: "Só meu" é sempre em nome de quem lança (pagador/responsável = eu). */
export function effectivePayerOf(s: DoorState, ctx: DoorCtx): string {
  const personal = s.kind === "EXPENSE" && !sharedOf(s, ctx);
  return personal && ctx.me ? ctx.me : s.payerId;
}

export type DoorSubmission =
  | { service: "TRANSACTION"; input: CreateTransactionInput }
  | { service: "PLANNED"; input: CreatePlannedExpenseInput }
  | { service: "SERIES"; input: CreateRecurringExpenseInput };

export function buildSubmission(s: DoorState, ctx: DoorCtx): DoorSubmission {
  const payer = effectivePayerOf(s, ctx);
  const service = serviceOf(s, ctx.flags);
  if (service === "PLANNED" || service === "SERIES") {
    const accountId = s.source.startsWith("acc:") ? s.source.slice(4) : "";
    const shared = ctx.splitAvailable ? s.shared : false;
    if (service === "SERIES") {
      return {
        service,
        input: {
          description: s.description,
          amountInCents: s.cents,
          categoryId: s.categoryId,
          ...(payer ? { responsibleMemberId: payer } : {}),
          isSharedExpense: shared,
          paymentAccountId: accountId,
          dayOfMonth: Number(s.day),
          startMonth: s.startMonth,
          end:
            s.endKind === "COUNT"
              ? { kind: "COUNT", months: Number(s.endMonths) }
              : { kind: "NONE" },
        },
      };
    }
    return {
      service,
      input: {
        ...(accountId ? { paymentAccountId: accountId } : {}),
        description: s.description,
        amountInCents: s.cents,
        categoryId: s.categoryId,
        ...(payer ? { responsibleMemberId: payer } : {}),
        isSharedExpense: shared,
        ...(s.date ? { dueOn: s.date } : {}),
        ...(s.note.trim() ? { note: s.note } : {}),
      },
    };
  }
  // TRANSACTION (mesmo corpo que o TransactionDrawer montava antes da porta)
  const source = s.kind === "INCOME" && s.source.startsWith("card:") ? "" : s.source;
  const fromCard = s.kind === "EXPENSE" && source.startsWith("card:");
  const paidActive = fromCard && s.installments > 1 && s.paidBeforeApp >= 1;
  return {
    service: "TRANSACTION",
    input: {
      type: s.kind,
      ...(fromCard
        ? { cardId: source.slice(5) }
        : { accountId: source.startsWith("acc:") ? source.slice(4) : "" }),
      categoryId: s.categoryId,
      amountInCents: s.cents,
      ...(payer ? { payerMemberId: payer } : {}),
      ...(paidActive
        ? s.paidAnchorOn
          ? { occurredOn: s.paidAnchorOn }
          : {}
        : s.date
          ? { occurredOn: s.date }
          : {}),
      ...(s.description.trim() ? { description: s.description } : {}),
      ...(s.note.trim() ? { note: s.note } : {}),
      ...(s.tags.length > 0 ? { tags: s.tags } : {}),
      ...(s.kind === "EXPENSE" ? { isSharedExpense: sharedOf(s, ctx) } : {}),
      ...(fromCard && s.installments > 1 ? { installments: s.installments } : {}),
      ...(fromCard && s.installments > 1 && s.paidBeforeApp >= 1
        ? { paidBeforeApp: s.paidBeforeApp }
        : {}),
    } as CreateTransactionInput,
  };
}

/** Campos do formulário (SDD-031 §6.3): vários caminhos da API caem no mesmo campo. */
export type DoorField =
  | "amountInCents"
  | "source"
  | "categoryId"
  | "date"
  | "description"
  | "note"
  | "payer"
  | "installments"
  | "paidBeforeApp"
  | "tags"
  | "day"
  | "startMonth"
  | "end";

const FIELD_OF: Record<string, DoorField> = {
  amountInCents: "amountInCents",
  accountId: "source",
  cardId: "source",
  paymentAccountId: "source",
  categoryId: "categoryId",
  occurredOn: "date",
  dueOn: "date",
  description: "description",
  note: "note",
  payerMemberId: "payer",
  responsibleMemberId: "payer",
  installments: "installments",
  paidBeforeApp: "paidBeforeApp",
  tags: "tags",
  dayOfMonth: "day",
  startMonth: "startMonth",
  end: "end",
};

export function fieldsFromIssues(
  issues: Array<{ path: string; message: string }>,
): Partial<Record<DoorField, string>> {
  const out: Partial<Record<DoorField, string>> = {};
  for (const i of issues) {
    const f = FIELD_OF[i.path.split(".")[0] as string];
    if (f && !out[f]) out[f] = i.message;
  }
  return out;
}

export type DoorValidation =
  | { ok: true; submission: DoorSubmission }
  | { ok: false; errors: Partial<Record<DoorField, string>> };

/** Valida com os schemas EXISTENTES (fonte única) mais a regra de porta (série exige conta). */
export function validateSubmission(s: DoorState, ctx: DoorCtx): DoorValidation {
  const sub = buildSubmission(s, ctx);
  // Data futura em NOW: o aviso do cliente é só da troca de modo; o envio mantém a validação do servidor.
  const extra: Partial<Record<DoorField, string>> = {};
  if (sub.service === "SERIES" && !sub.input.paymentAccountId) extra.source = SERIES_ACCOUNT_MSG;
  const schema =
    sub.service === "TRANSACTION"
      ? CreateTransactionSchema
      : sub.service === "PLANNED"
        ? CreatePlannedExpenseSchema
        : CreateRecurringExpenseSchema;
  const parsed = schema.safeParse(sub.input);
  const errors = {
    ...(parsed.success
      ? {}
      : fieldsFromIssues(
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        )),
    ...extra,
  };
  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  // O corpo de transação segue como montado (idêntico ao de antes); previsão/série usam o já normalizado.
  return {
    ok: true,
    submission:
      sub.service === "TRANSACTION" ? sub : ({ service: sub.service, input: parsed.data } as never),
  };
}
