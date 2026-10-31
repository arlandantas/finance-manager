import { describe, expect, it } from "vitest";
import {
  availability,
  buildSubmission,
  type DoorCtx,
  type DoorState,
  effectLine,
  laterHint,
  MODE_DEFAULTS,
  SERIES_ACCOUNT_MSG,
  saveLabel,
  seriesDefaults,
  serviceOf,
  sharedAfterModeChange,
  validateDateForWhen,
  validateSubmission,
} from "@/modules/lancamento/door";

const ACC = "11111111-1111-4111-8111-111111111111";
const CARD = "22222222-2222-4222-8222-222222222222";
const CAT = "33333333-3333-4333-8333-333333333333";
const ME = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

const ctx: DoorCtx = {
  today: "2026-10-12",
  me: ME,
  splitAvailable: true,
  splitBlocked: false,
  flags: { incomePlanned: false },
};
const base: DoorState = {
  kind: "EXPENSE",
  when: "NOW",
  repeat: "NONE",
  cents: 8000,
  description: "",
  categoryId: CAT,
  source: `acc:${ACC}`,
  payerId: ME,
  shared: false,
  sharedTouched: false,
  date: "",
  note: "",
  tags: [],
  installments: 1,
  paidBeforeApp: 0,
  paidAnchorOn: "",
  day: "10",
  startMonth: "2026-10",
  endKind: "NONE",
  endMonths: "",
};
const st = (o: Partial<DoorState>): DoorState => ({ ...base, ...o });

describe("serviceOf / availability", () => {
  it("escolhe o serviço por tipo x quando x repetir", () => {
    const f = { incomePlanned: false };
    expect(serviceOf(st({}), f)).toBe("TRANSACTION");
    expect(serviceOf(st({ kind: "INCOME" }), f)).toBe("TRANSACTION");
    expect(serviceOf(st({ when: "LATER" }), f)).toBe("PLANNED");
    expect(serviceOf(st({ when: "LATER", repeat: "MONTHLY" }), f)).toBe("SERIES");
    expect(serviceOf(st({ when: "LATER", kind: "INCOME" }), f)).toBeNull();
    expect(serviceOf(st({ when: "LATER", kind: "INCOME" }), { incomePlanned: true })).toBe(
      "PLANNED",
    );
  });
  it("indisponibiliza 'Vai acontecer' em receita e no cartão", () => {
    const f = ctx.flags;
    expect(availability(st({}), { flags: f }).later.enabled).toBe(true);
    expect(availability(st({ kind: "INCOME" }), { flags: f }).later).toEqual({
      enabled: false,
      reason: "INCOME_NOT_AVAILABLE",
    });
    expect(availability(st({ source: `card:${CARD}` }), { flags: f }).later).toEqual({
      enabled: false,
      reason: "CARD_SELECTED",
    });
    expect(
      availability(st({ kind: "INCOME" }), { flags: { incomePlanned: true } }).later.enabled,
    ).toBe(true);
    expect(availability(st({}), { flags: f }).repeat.enabled).toBe(true);
    expect(availability(st({ kind: "INCOME" }), { flags: f }).repeat.enabled).toBe(false);
    expect(laterHint("CARD_SELECTED")).toBe("No cartão, use Assinatura (todo mês)");
    expect(laterHint("INCOME_NOT_AVAILABLE")).toBe("Receita prevista ainda não está disponível");
    expect(laterHint(undefined)).toBeUndefined();
  });
});

describe("validateDateForWhen", () => {
  it("futura só vale em 'Vai acontecer'", () => {
    expect(validateDateForWhen("2026-10-20", "NOW", "2026-10-12")).toBe(
      "A data não pode ser futura",
    );
    expect(validateDateForWhen("2026-10-20", "LATER", "2026-10-12")).toBeNull();
    expect(validateDateForWhen("2026-10-01", "NOW", "2026-10-12")).toBeNull();
    expect(validateDateForWhen("2026-10-01", "LATER", "2026-10-12")).toBeNull();
    expect(validateDateForWhen("", "NOW", "2026-10-12")).toBeNull();
  });
  it("fronteira: hoje é válido; amanhã não", () => {
    expect(validateDateForWhen("2026-10-12", "NOW", "2026-10-12")).toBeNull();
    expect(validateDateForWhen("2026-10-13", "NOW", "2026-10-12")).not.toBeNull();
  });
});

describe("paridade do corpo (golden) com o que os drawers montavam", () => {
  it("TRANSACTION despesa em conta, só o essencial", () => {
    expect(buildSubmission(st({}), ctx)).toEqual({
      service: "TRANSACTION",
      input: {
        type: "EXPENSE",
        accountId: ACC,
        categoryId: CAT,
        amountInCents: 8000,
        payerMemberId: ME,
        isSharedExpense: false,
      },
    });
  });
  it("TRANSACTION completa: descrição, data, nota, tags, dividida", () => {
    const r = buildSubmission(
      st({
        description: "Mercado",
        date: "2026-10-01",
        note: "n",
        tags: ["a"],
        shared: true,
        payerId: OTHER,
      }),
      ctx,
    );
    expect(r.input).toEqual({
      type: "EXPENSE",
      accountId: ACC,
      categoryId: CAT,
      amountInCents: 8000,
      payerMemberId: OTHER,
      occurredOn: "2026-10-01",
      description: "Mercado",
      note: "n",
      tags: ["a"],
      isSharedExpense: true,
    });
  });
  it("TRANSACTION receita: sem isSharedExpense; cartão cai para sem conta", () => {
    const r = buildSubmission(st({ kind: "INCOME", source: `card:${CARD}` }), ctx);
    expect(r.input).toEqual({
      type: "INCOME",
      accountId: "",
      categoryId: CAT,
      amountInCents: 8000,
      payerMemberId: ME,
    });
  });
  it("TRANSACTION no cartão parcelado com parcelas pagas e fatura fechada", () => {
    const r = buildSubmission(
      st({
        source: `card:${CARD}`,
        installments: 6,
        paidBeforeApp: 2,
        paidAnchorOn: "2026-09-25",
        date: "2026-10-01",
      }),
      ctx,
    );
    expect(r.input).toMatchObject({
      type: "EXPENSE",
      cardId: CARD,
      installments: 6,
      paidBeforeApp: 2,
      occurredOn: "2026-09-25",
    });
    expect(r.input).not.toHaveProperty("accountId");
    const open = buildSubmission(
      st({ source: `card:${CARD}`, installments: 6, paidBeforeApp: 2, date: "2026-10-01" }),
      ctx,
    );
    expect(open.input).not.toHaveProperty("occurredOn");
  });
  it("PLANNED: descrição, conta opcional, vencimento, nota; sem tags nem parcelas", () => {
    const r = buildSubmission(
      st({
        when: "LATER",
        description: "Condomínio",
        date: "2026-10-20",
        note: "x",
        tags: ["t"],
        installments: 3,
      }),
      ctx,
    );
    expect(r).toEqual({
      service: "PLANNED",
      input: {
        paymentAccountId: ACC,
        description: "Condomínio",
        amountInCents: 8000,
        categoryId: CAT,
        responsibleMemberId: ME,
        isSharedExpense: false,
        dueOn: "2026-10-20",
        note: "x",
      },
    });
    const semConta = buildSubmission(st({ when: "LATER", source: "", description: "Água" }), ctx);
    expect(semConta.input).not.toHaveProperty("paymentAccountId");
    expect(semConta.input).not.toHaveProperty("dueOn");
  });
  it("SERIES: dia, início, fim; sem nota, tags nem parcelas", () => {
    const r = buildSubmission(
      st({
        when: "LATER",
        repeat: "MONTHLY",
        description: "Internet",
        note: "x",
        tags: ["t"],
        endKind: "COUNT",
        endMonths: "6",
      }),
      ctx,
    );
    expect(r).toEqual({
      service: "SERIES",
      input: {
        description: "Internet",
        amountInCents: 8000,
        categoryId: CAT,
        responsibleMemberId: ME,
        isSharedExpense: false,
        paymentAccountId: ACC,
        dayOfMonth: 10,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 6 },
      },
    });
  });
});

describe("SEC-026 na tradução", () => {
  it("'Só meu' força o pagador/responsável = eu nos três serviços", () => {
    for (const o of [
      {},
      { when: "LATER" as const },
      { when: "LATER" as const, repeat: "MONTHLY" as const },
    ]) {
      const r = buildSubmission(st({ ...o, payerId: OTHER, description: "Algo" }), ctx);
      const input = r.input as Record<string, unknown>;
      expect(input.payerMemberId ?? input.responsibleMemberId).toBe(ME);
    }
  });
  it("dividida respeita o escolhido; sem regra de divisão nunca divide", () => {
    const d = buildSubmission(
      st({ when: "LATER", shared: true, payerId: OTHER, description: "Algo" }),
      ctx,
    );
    expect(d.input).toMatchObject({ responsibleMemberId: OTHER, isSharedExpense: true });
    const n = buildSubmission(st({ shared: true }), { ...ctx, splitAvailable: false });
    expect(n.input).toMatchObject({ isSharedExpense: false });
  });
  it("modo: 'sujo' mantém, 'limpo' recebe o padrão", () => {
    expect(sharedAfterModeChange({ shared: true, sharedTouched: true }, "LATER")).toBe(true);
    expect(sharedAfterModeChange({ shared: true, sharedTouched: false }, "LATER")).toBe(
      MODE_DEFAULTS.LATER.shared,
    );
  });
});

describe("validateSubmission", () => {
  it("série exige conta de pagamento", () => {
    const v = validateSubmission(
      st({ when: "LATER", repeat: "MONTHLY", description: "Internet", source: "" }),
      ctx,
    );
    expect(v).toMatchObject({ ok: false, errors: { source: SERIES_ACCOUNT_MSG } });
  });
  it("previsão sem descrição pede a descrição; lançamento aceita sem", () => {
    expect(validateSubmission(st({ when: "LATER" }), ctx)).toMatchObject({
      ok: false,
      errors: { description: "Informe a descrição" },
    });
    expect(validateSubmission(st({}), ctx).ok).toBe(true);
  });
  it("data futura: o envio deixa a recusa ao servidor (mensagem do cliente só na troca de modo)", () => {
    expect(validateSubmission(st({ date: "2026-10-20" }), ctx).ok).toBe(true);
    expect(
      validateSubmission(st({ when: "LATER", description: "Condomínio", date: "2026-10-20" }), ctx)
        .ok,
    ).toBe(true);
  });
  it("série válida devolve o corpo normalizado", () => {
    const v = validateSubmission(
      st({ when: "LATER", repeat: "MONTHLY", description: " Internet " }),
      ctx,
    );
    expect(v.ok && v.submission.service).toBe("SERIES");
    expect(v.ok && (v.submission.input as { description: string }).description).toBe("Internet");
  });
  it("erros de campo da API mapeiam para os campos do formulário", () => {
    const v = validateSubmission(st({ cents: 0, categoryId: "" }), ctx);
    expect(v).toMatchObject({ ok: false });
    expect(!v.ok && Object.keys(v.errors)).toEqual(
      expect.arrayContaining(["amountInCents", "categoryId"]),
    );
  });
});

describe("textos e padrões", () => {
  it("saveLabel e effectLine", () => {
    expect(saveLabel({ kind: "EXPENSE", when: "NOW" })).toBe("Salvar despesa");
    expect(saveLabel({ kind: "INCOME", when: "NOW" })).toBe("Salvar receita");
    expect(saveLabel({ kind: "EXPENSE", when: "LATER" })).toBe("Salvar previsão");
    expect(effectLine("NOW", "NONE")).toBe("Já aconteceu: entra no extrato e nos saldos agora");
    expect(effectLine("LATER", "NONE")).toContain(
      "fica em A pagar até você dar baixa; não muda saldo nem extrato",
    );
    expect(effectLine("LATER", "MONTHLY")).toContain("as próximas 12 aparecem em A pagar");
  });
  it("seriesDefaults: da data digitada, senão de hoje", () => {
    expect(seriesDefaults("2026-11-05", "2026-10-12")).toEqual({ day: "5", startMonth: "2026-11" });
    expect(seriesDefaults("", "2026-10-12")).toEqual({ day: "12", startMonth: "2026-10" });
  });
});
