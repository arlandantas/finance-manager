import type {
  CreateTransferSeriesParsed,
  TransferSeriesImpactDTO,
} from "@/modules/previstas/transfer-schemas";
import { CreateTransferSeriesSchema } from "@/modules/previstas/transfer-schemas";

// US-101b: estado do formulário -> corpo da série de transferência (puro; nenhuma regra nasce aqui).
export type TransferSeriesField =
  | "amountInCents"
  | "fromAccountId"
  | "toAccountId"
  | "description"
  | "day"
  | "startMonth"
  | "end";

const FIELD_OF: Record<string, TransferSeriesField> = {
  amountInCents: "amountInCents",
  fromAccountId: "fromAccountId",
  toAccountId: "toAccountId",
  description: "description",
  dayOfMonth: "day",
  startMonth: "startMonth",
  end: "end",
};

export type TransferSeriesForm = {
  fromId: string;
  toId: string;
  cents: number;
  description: string;
  day: string;
  startMonth: string;
  endKind: "NONE" | "COUNT";
  endMonths: string;
};

type Errors = Partial<Record<TransferSeriesField, string>>;

export function fieldsFromSeriesIssues(issues: Array<{ path: string; message: string }>): Errors {
  const out: Errors = {};
  for (const i of issues) {
    const f = FIELD_OF[i.path.split(".")[0] ?? ""];
    if (f && !out[f]) out[f] = i.message;
  }
  return out;
}

const endOf = (f: TransferSeriesForm) =>
  f.endKind === "COUNT"
    ? { kind: "COUNT" as const, months: Number(f.endMonths) }
    : { kind: "NONE" as const };

export function buildTransferSeriesInput(
  f: TransferSeriesForm,
): { ok: true; input: CreateTransferSeriesParsed } | { ok: false; errors: Errors } {
  const parsed = CreateTransferSeriesSchema.safeParse({
    fromAccountId: f.fromId,
    toAccountId: f.toId,
    amountInCents: f.cents,
    ...(f.description.trim() ? { description: f.description } : {}),
    dayOfMonth: f.day.trim() === "" ? Number.NaN : Number(f.day),
    startMonth: f.startMonth,
    end: endOf(f),
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  return {
    ok: false,
    errors: fieldsFromSeriesIssues(
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    ),
  };
}

/** PATCH da série: mesma validação do cadastro (o `startMonth` é da série e não segue no corpo). */
export function buildTransferSeriesPatch(f: TransferSeriesForm, version: number) {
  const built = buildTransferSeriesInput(f);
  if (!built.ok) return built;
  const { input } = built;
  return {
    ok: true as const,
    input: {
      version,
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountInCents: input.amountInCents,
      description: f.description.trim() || null,
      dayOfMonth: input.dayOfMonth,
      end: input.end,
    },
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Aviso antes de editar: o servidor conta; a tela só descreve (SDD US-101b). */
export function seriesImpactText(i: TransferSeriesImpactDTO): string {
  return `Muda ${i.affectedCount}; ficam ${plural(i.keptRealizedCount, "efetivada", "efetivadas")} e ${plural(i.keptExceptionCount, "alterada", "alteradas")}`;
}
