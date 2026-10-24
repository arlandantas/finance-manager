import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride, withClock } from "@/lib/clock";
import { consentOn, enableAiFlag, freshFake, SILVA_NOW, seedSilva } from "../support/analise";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeCard, makeFamily, makeTransaction } from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(SILVA_NOW, fn);

const preview = (period = "2026-10") =>
  at(() => call(lucas(), "GET", `/api/v1/ai/spending-analysis/preview?period=${period}`));
const analyze = async (period = "2026-10") => {
  const pv = await preview(period);
  return at(() =>
    call(lucas(), "POST", "/api/v1/ai/spending-analyses", {
      period,
      previewHash: pv.body.previewHash,
    }),
  );
};

beforeEach(async () => {
  await resetDb();
  enableAiFlag();
  freshFake();
  setDevClockOverride(null);
  fx = await makeFamily();
  await seedSilva(fx);
  await consentOn(fx);
});

describe("US-070b recorrentes e gastos evitáveis", () => {
  it('"Streaming X" de R$ 55,90 em 4 meses: recorrente DETECTED, R$ 55,90 por mês e R$ 670,80 por ano', async () => {
    const pv = await preview();
    const rec = pv.body.payload.recurring as {
      source: string;
      monthlyAvgInCents: number;
      presentIn: number[];
    }[];
    const streaming = rec.find((r) => r.monthlyAvgInCents === 5590);
    expect(streaming).toMatchObject({ source: "DETECTED", presentIn: [-3, -2, -1, 0] });
    // o NOME do recorrente nunca vai ao payload
    expect(JSON.stringify(pv.body.payload)).not.toMatch(/Streaming/i);
    expect(pv.body.readable.recurring.map((r: { label: string }) => r.label).join("|")).not.toMatch(
      /Streaming/,
    );

    const r = await analyze();
    expect(r.status).toBe(201);
    const card = (r.body.avoidable as { displayName: string }[]).find(
      (a) => a.displayName === "Streaming X",
    ) as Record<string, unknown>;
    expect(card).toMatchObject({
      kind: "RECURRING",
      monthlyInCents: 5590,
      annualInCents: 67_080,
    });
    expect(String(card.drillUrl)).toContain("/extrato?period=2026-10");
    expect(String(card.drillUrl)).toContain("q=Streaming+X");
  });

  it("os números do cartão vêm do payload gravado, nunca da IA (texto com número é substituído)", async () => {
    freshFake().scenario = "numbers_in_text";
    const r = await analyze();
    const card = (r.body.avoidable as { displayName: string; annualInCents: number }[]).find(
      (a) => a.displayName === "Streaming X",
    );
    expect(card?.annualInCents).toBe(67_080);
    expect(JSON.stringify(r.body.avoidable)).not.toMatch(/999/);
  });

  it("parcelas, receitas e excluídos NÃO são recorrentes", async () => {
    const account = await db.bankAccount.findFirstOrThrow({ where: { familyId: fx.family.id } });
    const card = await makeCard(fx, {
      name: "Cartão",
      closingDay: 20,
      dueDay: 28,
      limitInCents: 5_000_000,
    });
    await makeInstallmentPurchase(fx, {
      card,
      total: 360_000,
      count: 6,
      purchaseOn: "2026-06-10",
      category: "Outros",
      description: "Sofá parcelado",
    });
    setDevClockOverride(null);
    for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) {
      await makeTransaction(fx, {
        account: { id: account.id, name: account.name, ownerMemberId: account.ownerMemberId },
        category: "Outros",
        amountInCents: 7_000,
        description: "Item apagado",
        occurredOn: `${m}-09`,
        deleted: true,
      });
    }
    const pv = await preview();
    const labels = JSON.stringify(pv.body.readable);
    expect(labels).not.toMatch(/Sofá|apagado/i);
    // 'Sofá parcelado' só existe como total de categoria; não há recorrente com a média da parcela
    const rec = pv.body.payload.recurring as { monthlyAvgInCents: number }[];
    expect(rec.some((r) => r.monthlyAvgInCents === 60_000)).toBe(false);
    // Renda recorrente ("Salário") não entra: só despesas
    expect(JSON.stringify(pv.body.payload)).not.toMatch(/Salário/);
  });

  it("série de despesa prevista com ≥ 2 baixas na janela é SCHEDULED, e o nome da série fica só local", async () => {
    const account = await db.bankAccount.findFirstOrThrow({ where: { familyId: fx.family.id } });
    const moradia = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Lazer" },
    });
    const mariana = fx.byName.Mariana?.memberId as string;
    const series = await db.recurringExpense.create({
      data: {
        familyId: fx.family.id,
        description: "Clube Solar",
        amountInCents: 45_000n,
        categoryId: moradia.id,
        responsibleMemberId: mariana,
        authorMemberId: mariana,
        paymentAccountId: account.id,
        dayOfMonth: 8,
        startMonth: new Date("2026-07-01T00:00:00Z"),
        generatedThroughMonth: new Date("2026-10-01T00:00:00Z"),
      },
    });
    for (const m of ["2026-08", "2026-09", "2026-10"]) {
      const paid = await db.transaction.create({
        data: {
          familyId: fx.family.id,
          kind: "EXPENSE",
          direction: "DEBIT",
          accountId: account.id,
          categoryId: moradia.id,
          amountInCents: 45_000n,
          occurredOn: new Date(`${m}-08T00:00:00Z`),
          description: "Clube Solar",
          payerMemberId: mariana,
          authorMemberId: mariana,
          isSharedExpense: false,
        },
      });
      await db.plannedExpense.create({
        data: {
          familyId: fx.family.id,
          description: "Clube Solar",
          amountInCents: 45_000n,
          dueOn: new Date(`${m}-08T00:00:00Z`),
          categoryId: moradia.id,
          responsibleMemberId: mariana,
          authorMemberId: mariana,
          status: "PAGO",
          paidTransactionId: paid.id,
          seriesId: series.id,
          occurrenceMonth: new Date(`${m}-01T00:00:00Z`),
          paymentAccountId: account.id,
        },
      });
    }
    const pv = await preview();
    const scheduled = (
      pv.body.payload.recurring as {
        source: string;
        monthlyAvgInCents: number;
        presentIn: number[];
      }[]
    ).filter((r) => r.source === "SCHEDULED");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ monthlyAvgInCents: 45_000, presentIn: [-2, -1, 0] });
    expect(JSON.stringify(pv.body.payload)).not.toMatch(/Clube/i);
    const r = await analyze();
    const names = (r.body.avoidable as { displayName: string }[]).map((a) => a.displayName);
    // o nome da série aparece só na tela (resolvido localmente); a baixa "Taxa mensal" não é o nome
    expect(names).toContain("Clube Solar");
    const card = (r.body.avoidable as { displayName: string; monthlyInCents: number }[]).find(
      (a) => a.displayName === "Clube Solar",
    );
    expect(card?.monthlyInCents).toBe(45_000);
  });

  it("máximo de 15 recorrentes, por valor mensal decrescente", async () => {
    const account = await db.bankAccount.findFirstOrThrow({ where: { familyId: fx.family.id } });
    for (let k = 0; k < 18; k++) {
      for (const m of ["2026-08", "2026-09", "2026-10"]) {
        await makeTransaction(fx, {
          account: { id: account.id, name: account.name, ownerMemberId: account.ownerMemberId },
          category: "Outros",
          amountInCents: 1_000 + k * 100,
          description: `Servico ${String.fromCharCode(97 + k)}`,
          occurredOn: `${m}-11`,
        });
      }
    }
    const rec = (await preview()).body.payload.recurring as { monthlyAvgInCents: number }[];
    expect(rec.length).toBeLessThanOrEqual(15);
    const sorted = [...rec].sort((a, b) => b.monthlyAvgInCents - a.monthlyAvgInCents);
    expect(rec.map((r) => r.monthlyAvgInCents).sort((a, b) => b - a)).toEqual(
      sorted.map((r) => r.monthlyAvgInCents),
    );
    expect(Math.max(...rec.map((r) => r.monthlyAvgInCents))).toBe(150_000); // Aluguel
  });
});
