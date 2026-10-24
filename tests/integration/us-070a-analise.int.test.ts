import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import {
  AnalysisPayloadSchema,
  assertNoIdentifiers,
  canonicalJson,
} from "@/modules/analise-ia/payload";
import {
  consentOff,
  consentOn,
  domainChecksum,
  enableAiFlag,
  freshFake,
  SILVA_NOW,
  seedSilva,
} from "../support/analise";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(SILVA_NOW, fn);

const preview = (period = "2026-10", as = lucas()) =>
  at(() => call(as, "GET", `/api/v1/ai/spending-analysis/preview?period=${period}`));
const send = async (period = "2026-10", as = lucas(), hash?: string) => {
  const pv = hash ? null : await preview(period, as);
  return at(() =>
    call(as, "POST", "/api/v1/ai/spending-analyses", {
      period,
      previewHash: hash ?? pv?.body.previewHash,
    }),
  );
};

beforeEach(async () => {
  await resetDb();
  enableAiFlag();
  freshFake();
  fx = await makeFamily();
});

describe("US-070a pré-visualização: o que será enviado", () => {
  beforeEach(async () => {
    await seedSilva(fx);
    await consentOn(fx);
  });

  it("não chama o LLM e descreve exatamente o que vai", async () => {
    const fake = freshFake();
    const r = await preview();
    expect(r.status).toBe(200);
    expect(fake.calls).toHaveLength(0);
    expect(r.body.eligible).toBe(true);
    expect(r.body.period).toEqual({ key: "2026-10", label: "out/2026", partial: false });
    expect(r.body.sentSummary).toBe(
      "totais por categoria dos últimos 4 meses e valores recorrentes, sem nomes de pessoas nem dados de conta",
    );
    expect(AnalysisPayloadSchema.safeParse(r.body.payload).success).toBe(true);
    expect(r.body.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.body.feature.state).toBe("ON");
    expect(r.body.limitReached).toBe(false);
  });

  it("padrão: último mês fechado; mês corrente é aceito como parcial; futuro é 400", async () => {
    const def = await at(() => call(lucas(), "GET", "/api/v1/ai/spending-analysis/preview"));
    expect(def.body.period.key).toBe("2026-10");
    const cur = await preview("2026-11");
    expect(cur.status).toBe(200);
    expect(cur.body.period).toEqual({ key: "2026-11", label: "nov/2026", partial: true });
    expect(cur.body.payload ? cur.body.payload.partial : null).toBe(true);
    expect((await preview("2026-12")).status).toBe(400);
  });

  it("o payload não contém nome, e-mail nem UUID de ninguém", async () => {
    const r = await preview();
    expect(() =>
      assertNoIdentifiers(r.body.payload, ["Mariana", "Lucas", "Silva", "mariana@exemplo.com"]),
    ).not.toThrow();
    expect(JSON.stringify(r.body.payload)).not.toMatch(/Streaming|Nubank|Aluguel/);
  });

  it("números vêm do sistema: Σ categorias do mês 0 = Resumo do Mês; Lazer = R$ 480,00", async () => {
    const r = await preview();
    const p = r.body.payload;
    const lazer = p.categories.find((c: { label: string }) => c.label === "Lazer");
    expect(lazer.totals.find((t: { rel: number }) => t.rel === 0).amountInCents).toBe(48_000);
    const sum = p.categories.reduce(
      (s: number, c: { totals: { rel: number; amountInCents: number }[] }) =>
        s + (c.totals.find((t) => t.rel === 0)?.amountInCents ?? 0),
      0,
    );
    const summary = await at(() => call(lucas(), "GET", "/api/v1/month-summary?period=2026-10"));
    expect(sum).toBe(summary.body.expenseInCents);
    expect(p.months.find((m: { rel: number }) => m.rel === 0).expenseInCents).toBe(
      summary.body.expenseInCents,
    );
  });

  it("poucos dados: 1 mês ⇒ inelegível; POST ⇒ 422 NOT_ENOUGH_MONTHS", async () => {
    await resetDb();
    fx = await makeFamily();
    await seedSilva(fx, { months: ["2026-10"] });
    await consentOn(fx);
    const r = await preview();
    expect(r.body.eligible).toBe(false);
    expect(r.body.ineligibleReason).toBe("NOT_ENOUGH_MONTHS");
    expect(r.body.ineligibleMessage).toBe(
      "Precisa de pelo menos 2 meses com lançamentos para analisar",
    );
    const p = await at(() =>
      call(lucas(), "POST", "/api/v1/ai/spending-analyses", {
        period: "2026-10",
        previewHash: "a".repeat(64),
      }),
    );
    expect(p.status).toBe(422);
    expect(p.body.error.code).toBe("NOT_ENOUGH_MONTHS");
    expect(await db.spendingAnalysis.count()).toBe(0);
  });

  it("só o Administrador vê a estimativa de custo", async () => {
    expect((await preview("2026-10", mariana())).body.estimateInCents).toBeGreaterThan(0);
    expect((await preview("2026-10", lucas())).body.estimateInCents).toBeNull();
  });

  it("categoria arquivada com valor entra; rótulo sem nome de membro", async () => {
    const escola = await db.category.create({
      data: {
        familyId: fx.family.id,
        name: "Escola do Lucas 2026",
        kind: "EXPENSE",
        icon: "graduation-cap",
        sortOrder: 99,
      },
    });
    await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        accountId: (await db.bankAccount.findFirstOrThrow({ where: { familyId: fx.family.id } }))
          .id,
        categoryId: escola.id,
        amountInCents: 10_000n,
        occurredOn: new Date("2026-10-08T00:00:00Z"),
        description: "Mensalidade",
        payerMemberId: fx.byName.Mariana?.memberId as string,
        authorMemberId: fx.byName.Mariana?.memberId as string,
        isSharedExpense: false,
      },
    });
    await db.category.update({ where: { id: escola.id }, data: { archivedAt: new Date() } });
    const r = await preview();
    const labels = r.body.payload.categories.map((c: { label: string }) => c.label);
    expect(labels).toContain("Escola do pessoa");
    expect(JSON.stringify(r.body.payload)).not.toMatch(/Lucas/);
  });
});

describe("US-070a pedir a análise", () => {
  beforeEach(async () => {
    await seedSilva(fx);
    await consentOn(fx);
  });

  it("201: o provedor recebe EXATAMENTE o JSON exibido; resultado classifica com o porquê", async () => {
    const fake = freshFake();
    const pv = await preview();
    const r = await send("2026-10", lucas(), pv.body.previewHash);
    expect(r.status).toBe(201);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.input).toBe(canonicalJson(pv.body.payload));
    expect(fake.calls[0]?.input).not.toMatch(/Mariana|Lucas|Silva|Streaming/);
    const dto = r.body;
    expect(dto.aiGenerated).toBe(true);
    expect(dto.disclaimer).toBe(
      "Análise educativa. Não substitui um profissional. Nenhum dado foi alterado.",
    );
    // toda categoria enviada aparece num grupo com motivo
    const shown = dto.groups.flatMap((g: { categories: unknown[] }) => g.categories);
    expect(shown).toHaveLength(pv.body.payload.categories.length);
    for (const c of shown as { reason: string }[]) expect(c.reason.length).toBeGreaterThan(0);
    const classes = dto.groups.map((g: { class: string }) => g.class);
    expect(classes).toEqual(expect.arrayContaining(["ESSENTIAL", "SUPERFLUOUS"]));
    const essentials = dto.groups.find((g: { class: string }) => g.class === "ESSENTIAL");
    expect(essentials.categories.map((c: { label: string }) => c.label)).toEqual(
      expect.arrayContaining(["Moradia", "Supermercado", "Saúde"]),
    );
    // valores do sistema
    const lazer = dto.groups
      .flatMap(
        (g: {
          categories: { label: string; amountInCents: number; prevAmountInCents: number }[];
        }) => g.categories,
      )
      .find((c: { label: string }) => c.label === "Lazer");
    expect(lazer.amountInCents).toBe(48_000);
    expect(lazer.prevAmountInCents).toBe(35_590);
    expect(await db.spendingAnalysis.count()).toBe(1);
    const row = await db.spendingAnalysis.findFirstOrThrow();
    expect(row.promptVersion).toBe(1);
    const ev = await db.llmUsageEvent.findFirstOrThrow();
    expect(ev.analysisId).toBe(row.id);
  });

  it("texto da IA com número é substituído; o valor mostrado continua o do sistema", async () => {
    freshFake().scenario = "numbers_in_text";
    const r = await send();
    expect(r.status).toBe(201);
    const text = JSON.stringify(r.body);
    expect(text).not.toMatch(/999/);
    expect(r.body.summaryFromAi).toBe(false);
    const lazer = r.body.groups
      .flatMap(
        (g: {
          categories: {
            label: string;
            amountInCents: number;
            reasonFromAi: boolean;
            reason: string;
          }[];
        }) => g.categories,
      )
      .find((c: { label: string }) => c.label === "Lazer");
    expect(lazer.amountInCents).toBe(48_000);
    expect(lazer.reasonFromAi).toBe(false);
    expect(lazer.reason).toBe("Classificada como Supérfluo neste mês");
  });

  it("análise não aponta pessoas", async () => {
    freshFake().scenario = "member_name_in_text";
    const r = await send();
    expect(r.status).toBe(201);
    const texts = [
      r.body.summary,
      ...r.body.groups.flatMap((g: { categories: { reason: string }[] }) =>
        g.categories.map((c) => c.reason),
      ),
      ...r.body.avoidable.map((a: { reason: string }) => a.reason),
    ].join(" | ");
    expect(texts).not.toMatch(/Mariana|Lucas/);
    expect(r.body.disclaimer).toContain("Não substitui um profissional");
  });

  it("nunca altera dados do domínio (checksum)", async () => {
    const before = await domainChecksum();
    const r = await send();
    expect(r.status).toBe(201);
    expect(await domainChecksum()).toBe(before);
  });

  it.each([
    "unavailable",
    "timeout",
    "rate_limited",
    "auth",
    "truncated",
    "refusal",
    "invalid_json",
    "schema_violation",
    "unknown_ids",
    "duplicate_refs",
  ] as const)("erro do provedor (%s): mensagem neutra e nada salvo", async (scenario) => {
    freshFake().scenario = scenario;
    const r = await send();
    expect([502, 503]).toContain(r.status);
    expect(r.body.error.message).toBe(
      "Não foi possível analisar agora. Tente novamente em instantes",
    );
    expect(await db.spendingAnalysis.count()).toBe(0);
  });

  it("IA desligada ⇒ 409 AI_DISABLED, sem chamada ao provedor", async () => {
    await consentOff(fx);
    const fake = freshFake();
    const r = await send();
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("AI_DISABLED");
    expect(fake.calls).toHaveLength(0);
  });

  it("dados mudaram entre o preview e o envio ⇒ 409 PREVIEW_STALE e zero chamadas", async () => {
    const pv = await preview();
    const account = await db.bankAccount.findFirstOrThrow({ where: { familyId: fx.family.id } });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        accountId: account.id,
        categoryId: cat.id,
        amountInCents: 1_000n,
        occurredOn: new Date("2026-10-20T00:00:00Z"),
        description: "Extra",
        payerMemberId: fx.byName.Mariana?.memberId as string,
        authorMemberId: fx.byName.Mariana?.memberId as string,
        isSharedExpense: false,
      },
    });
    const fake = freshFake();
    const r = await send("2026-10", lucas(), pv.body.previewHash);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("PREVIEW_STALE");
    expect(fake.calls).toHaveLength(0);
  });

  it("limite: a 4ª análise do período ⇒ 422 ANALYSIS_LIMIT_REACHED", async () => {
    for (let i = 0; i < 3; i++) expect((await send()).status).toBe(201);
    const fake = freshFake();
    const r = await send();
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("ANALYSIS_LIMIT_REACHED");
    expect(r.body.error.message).toBe("Este mês já foi analisado 3 vezes");
    expect(fake.calls).toHaveLength(0);
    expect((await preview()).body.limitReached).toBe(true);
  });

  it("concorrência: 5 pedidos simultâneos ⇒ no máximo 3 análises criadas", async () => {
    const pv = await preview();
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => send("2026-10", lucas(), pv.body.previewHash)),
    );
    expect(rs.filter((r) => r.status === 201).length).toBeLessThanOrEqual(3);
    expect(await db.spendingAnalysis.count()).toBeLessThanOrEqual(3);
    expect(rs.every((r) => [201, 422].includes(r.status))).toBe(true);
  });

  it("histórico e detalhe: qualquer membro lê; outra família recebe 404", async () => {
    const created = await send("2026-10", lucas());
    const id = created.body.id;
    const list = await at(() => call(mariana(), "GET", "/api/v1/ai/spending-analyses"));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].requestedBy.name).toBe("Lucas Silva");
    expect(
      (await at(() => call(mariana(), "GET", `/api/v1/ai/spending-analyses/${id}`))).status,
    ).toBe(200);
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    const o = other.members[0]?.as ?? null;
    expect((await at(() => call(o, "GET", `/api/v1/ai/spending-analyses/${id}`))).status).toBe(404);
    expect(
      (await at(() => call(o, "GET", `/api/v1/ai/spending-analyses/${id}/sent-data`))).status,
    ).toBe(404);
    expect((await at(() => call(o, "GET", "/api/v1/ai/spending-analyses/nao-e-uuid"))).status).toBe(
      404,
    );
  });
});
