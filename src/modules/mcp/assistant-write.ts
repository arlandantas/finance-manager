import { ApiError, unprocessable } from "@/lib/api/errors";
import type { Tx } from "@/lib/api/types";
import { addDays, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { formatBRL, toCents } from "@/lib/money";
import { issuerOf } from "@/modules/mcp/config";
import type { McpContext } from "@/modules/mcp/context";
import { assistantUsage, effectiveLimits } from "@/modules/mcp/limits";
import { CreateExpenseSchema } from "@/modules/transacoes/schemas";
import { createExpenseCore } from "@/modules/transacoes/service";

// SDD-027 §R2.4: `lancar_despesa` — grava AGORA uma despesa à vista "Só meu" do membro, sem confirmação.
// Tudo numa transação, em ordem fixa: trava do membro → idempotência → duplicata natural → data →
// limites do membro → o MESMO `createExpenseCore` do app (validações do domínio) → resposta.
export const MAX_BACKDATE_DAYS = 60;
export const NATURAL_DUPLICATE_MIN = 10;

export type LancarInput = {
  description: string;
  amountInCents: number;
  categoryId: string;
  accountId?: string | undefined;
  cardId?: string | undefined;
  occurredOn?: string | undefined;
  idempotencyKey?: string | undefined;
  allowDuplicate: boolean;
};

export type LancarOutput = {
  transactionId: string;
  duplicate: boolean;
  summary: string;
  amount: number;
  occurredOn: string;
  category: string;
  source: string;
  viewUrl: string;
  limits: { remainingToday: number | null; remainingThisHour: number | null };
  message: string;
};

const money = (cents: number) => formatBRL(cents).replace(/ /g, " ");
const brDate = (iso: string) => iso.split("-").reverse().join("/");
/** Descrição "normalizada" para comparar duplicatas: NFKC, sem espaços nas pontas, sem caixa. */
const norm = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");

const limitExceeded = (message: string) => new ApiError(422, "LIMIT_EXCEEDED", message);

type Existing = Awaited<ReturnType<typeof loadExisting>>;
async function loadExisting(tx: Tx, familyId: string, id: string) {
  return tx.transaction.findFirstOrThrow({
    where: { id, familyId },
    include: {
      account: { select: { name: true } },
      card: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
}

function render(
  t: Existing,
  extra: { duplicate: boolean; message: string; remaining: LancarOutput["limits"] },
): LancarOutput {
  const occurredOn = fromDbDate(t.occurredOn);
  const amount = toCents(t.amountInCents);
  const source = t.card?.name ?? t.account?.name ?? "";
  const category = t.category?.name ?? "";
  return {
    transactionId: t.id,
    duplicate: extra.duplicate,
    summary: `${t.description} ${money(amount)} · ${source} · ${category} · Só meu · ${brDate(occurredOn)}`,
    amount,
    occurredOn,
    category,
    source,
    viewUrl: `${issuerOf()}/extrato?period=${occurredOn.slice(0, 7)}&highlight=${t.id}`,
    limits: extra.remaining,
    message: extra.message,
  };
}

function remainingOf(
  limits: { maxTxPerDay: number | null; maxTxPerHour: number | null },
  usage: { today: number; lastHour: number },
): LancarOutput["limits"] {
  return {
    remainingToday:
      limits.maxTxPerDay === null ? null : Math.max(0, limits.maxTxPerDay - usage.today),
    remainingThisHour:
      limits.maxTxPerHour === null ? null : Math.max(0, limits.maxTxPerHour - usage.lastHour),
  };
}

export async function lancarDespesa(
  tx: Tx,
  ctx: McpContext,
  input: LancarInput,
): Promise<LancarOutput> {
  // 1) trava por membro: contagem dos limites e gravação ficam serializadas
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`assistant-write:${ctx.memberId}`}, 0))`;
  const now = ctx.clock.now();
  const today = todayInFamilyTz(ctx.clock);
  const limits = await effectiveLimits(tx, ctx.familyId, ctx.memberId);
  const usage = await assistantUsage(tx, ctx);
  const sourceWhere = input.cardId ? { cardId: input.cardId } : { accountId: input.accountId };

  // 2) idempotência por chave
  if (input.idempotencyKey) {
    const same = await tx.transaction.findFirst({
      where: {
        familyId: ctx.familyId,
        assistantGrantId: ctx.grantId,
        assistantIdemKey: input.idempotencyKey,
      },
    });
    if (same) {
      const sameContent =
        norm(same.description) === norm(input.description) &&
        toCents(same.amountInCents) === input.amountInCents &&
        same.categoryId === input.categoryId &&
        (input.cardId ? same.cardId === input.cardId : same.accountId === input.accountId) &&
        (!input.occurredOn || fromDbDate(same.occurredOn) === input.occurredOn);
      if (!sameContent) {
        throw unprocessable("IDEMPOTENCY_KEY_REUSED", "Esta chave já foi usada com outro pedido");
      }
      return render(await loadExisting(tx, ctx.familyId, same.id), {
        duplicate: true,
        message: same.deletedAt
          ? "Este lançamento foi excluído no app"
          : "Este lançamento já foi registrado com esta chave.",
        remaining: remainingOf(limits, usage),
      });
    }
  }

  // 3) duplicata natural (não conta no limite)
  const occurredOn = input.occurredOn ?? today;
  if (!input.allowDuplicate) {
    const candidates = await tx.transaction.findMany({
      where: {
        familyId: ctx.familyId,
        origin: "ASSISTANT",
        assistantGrantId: ctx.grantId,
        deletedAt: null,
        amountInCents: BigInt(input.amountInCents),
        occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
        createdAt: { gte: new Date(now.getTime() - NATURAL_DUPLICATE_MIN * 60_000) },
        ...sourceWhere,
      },
      orderBy: { createdAt: "desc" },
    });
    const dup = candidates.find((c) => norm(c.description) === norm(input.description));
    if (dup) {
      const mins = Math.max(1, Math.round((now.getTime() - dup.createdAt.getTime()) / 60_000));
      return render(await loadExisting(tx, ctx.familyId, dup.id), {
        duplicate: true,
        message: `Já existe um lançamento igual há ${mins} min. Se for outra compra, reenvie com allowDuplicate.`,
        remaining: remainingOf(limits, usage),
      });
    }
  }

  // 4) data: de hoje até 60 dias atrás (mais estreito que o app)
  if (occurredOn > today || occurredOn < addDays(today, -MAX_BACKDATE_DAYS)) {
    throw unprocessable(
      "DATE_OUT_OF_RANGE",
      `data fora do prazo permitido (de hoje até ${MAX_BACKDATE_DAYS} dias atrás)`,
    );
  }

  // 5) limites do membro (null = sem limite). Excluir não devolve a cota: a contagem inclui excluídos.
  if (limits.maxAmountPerTxCents !== null && input.amountInCents > limits.maxAmountPerTxCents) {
    throw limitExceeded(
      `Valor acima do seu limite por lançamento pelo assistente (${money(limits.maxAmountPerTxCents)}). Lance pelo app ou ajuste o limite em Configurações.`,
    );
  }
  if (limits.maxTxPerDay !== null && usage.today >= limits.maxTxPerDay) {
    throw limitExceeded("Limite diário de lançamentos pelo assistente atingido");
  }
  if (limits.maxTxPerHour !== null && usage.lastHour >= limits.maxTxPerHour) {
    throw limitExceeded("Limite de lançamentos por hora pelo assistente atingido");
  }

  // 6) o MESMO núcleo da despesa do app (conta/cartão ativos, categoria de despesa ativa, fatura não paga…)
  const parsed = CreateExpenseSchema.parse({
    type: "EXPENSE",
    amountInCents: input.amountInCents,
    categoryId: input.categoryId,
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.cardId ? { cardId: input.cardId } : {}),
    occurredOn,
    description: input.description,
    isSharedExpense: false,
    installments: 1,
  });
  const created = await createExpenseCore(tx, ctx, parsed, {
    assistant: {
      grantId: ctx.grantId,
      idemKey: input.idempotencyKey ?? null,
      label: ctx.grantLabel,
    },
  });
  const afterUsage = { today: usage.today + 1, lastHour: usage.lastHour + 1 };
  return render(await loadExisting(tx, ctx.familyId, created.transaction.id), {
    duplicate: false,
    message: "Lançado. O membro pode conferir ou excluir no app.",
    remaining: remainingOf(limits, afterUsage),
  });
}
