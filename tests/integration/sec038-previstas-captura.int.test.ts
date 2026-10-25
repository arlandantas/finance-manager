import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

// SEC-038 (reteste final 2026-10-25, D-GES-48): previstas e séries divididas seguem a regra das despesas:
// só o responsável atual (ou o autor, para assumir) se coloca como responsável e só o responsável torna "Só meu".
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let acc: AccountFixture;
const A = () => fx.byName.Mariana?.as ?? null; // responsável e autora
const C = () => fx.byName.Lucas?.as ?? null; // terceiro
const B = () => fx.byName.Bia?.as ?? null; // autora de uma prevista cujo responsável é A
const idOf = (n: string) => fx.byName[n]?.memberId as string;
const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "bia@exemplo.com", name: "Bia Silva", role: "MEMBER" },
    ],
  });
  acc = await makeAccount(fx, { name: "Conta A", owner: "Mariana", openingBalanceInCents: 100000 });
});

const plannedBody = async (over: Record<string, unknown> = {}) => ({
  description: "Condomínio",
  amountInCents: 40000,
  dueOn: "2026-10-10",
  categoryId: await catId("Moradia"),
  responsibleMemberId: idOf("Mariana"),
  isSharedExpense: true,
  ...over,
});
const mkPlanned = async (as: ReturnType<typeof A>, over: Record<string, unknown> = {}) => {
  const res = await at(async () =>
    call(as, "POST", "/api/v1/planned-expenses", await plannedBody(over)),
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.plannedExpense as { id: string; version: number };
};
const patchPlanned = (as: ReturnType<typeof A>, id: string, body: Record<string, unknown>) =>
  at(async () => call(as, "PATCH", `/api/v1/planned-expenses/${id}`, body));

describe("SEC-038 prevista dividida não é 'capturada'", () => {
  it("reprodução do relatório: C troca o responsável para si e marca 'Só meu' num PATCH => 403 e A segue no controle", async () => {
    const p = await mkPlanned(A());
    const res = await patchPlanned(C(), p.id, {
      version: p.version,
      isSharedExpense: false,
      responsibleMemberId: idOf("Lucas"),
    });
    expect(res.status).toBe(403);
    expect(res.body.code ?? res.body.error?.code).toBe("PERSONAL_OWNER_ONLY");
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.isSharedExpense).toBe(true);
    expect(row.responsibleMemberId).toBe(idOf("Mariana"));
    expect(
      (await patchPlanned(A(), p.id, { version: p.version, amountInCents: 41000 })).status,
    ).toBe(200);
  });

  it("segundo caminho: C só se pôr como responsável (sem 'Só meu') também é recusado; C só 'Só meu' sem ser responsável também", async () => {
    const p = await mkPlanned(A());
    const takeOver = await patchPlanned(C(), p.id, {
      version: p.version,
      responsibleMemberId: idOf("Lucas"),
    });
    expect(takeOver.status).toBe(403);
    const personal = await patchPlanned(C(), p.id, { version: p.version, isSharedExpense: false });
    expect(personal.status).toBe(403);
  });

  it("o responsável (A) torna 'Só meu'; o autor (B) pode assumir a que criou em nome de A; terceiro segue livre p/ editar o resto", async () => {
    const p = await mkPlanned(A());
    expect(
      (await patchPlanned(C(), p.id, { version: p.version, amountInCents: 41000 })).status,
    ).toBe(200);
    const mine = await patchPlanned(A(), p.id, { version: p.version + 1, isSharedExpense: false });
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    const q = await mkPlanned(B(), {
      description: "Internet",
      responsibleMemberId: idOf("Mariana"),
    });
    const take = await patchPlanned(B(), q.id, {
      version: q.version,
      responsibleMemberId: idOf("Bia"),
    });
    expect(take.status, JSON.stringify(take.body)).toBe(200);
  });
});

describe("SEC-038 série recorrente dividida não é 'capturada'", () => {
  const seriesBody = async (over: Record<string, unknown> = {}) => ({
    description: "Aluguel",
    amountInCents: 100000,
    categoryId: await catId("Moradia"),
    responsibleMemberId: idOf("Mariana"),
    isSharedExpense: true,
    paymentAccountId: acc.id,
    dayOfMonth: 5,
    startMonth: "2026-10",
    end: { kind: "COUNT", months: 3 },
    ...over,
  });
  it("reprodução do relatório (PATCH /recurring-expenses): C não captura a série, os meses seguem do responsável", async () => {
    const ok = await at(async () =>
      call(A(), "POST", "/api/v1/recurring-expenses", await seriesBody()),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const s = ok.body.series as { id: string; version: number };
    const res = await at(async () =>
      call(C(), "PATCH", `/api/v1/recurring-expenses/${s.id}`, {
        version: s.version,
        isSharedExpense: false,
        responsibleMemberId: idOf("Lucas"),
      }),
    );
    expect(res.status).toBe(403);
    const row = await db.recurringExpense.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.isSharedExpense).toBe(true);
    expect(row.responsibleMemberId).toBe(idOf("Mariana"));
    const only = await at(async () =>
      call(C(), "PATCH", `/api/v1/recurring-expenses/${s.id}`, {
        version: s.version,
        responsibleMemberId: idOf("Lucas"),
      }),
    );
    expect(only.status).toBe(403);
    const mine = await at(async () =>
      call(A(), "PATCH", `/api/v1/recurring-expenses/${s.id}`, {
        version: s.version,
        isSharedExpense: false,
      }),
    );
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
  });
});

describe("SEC-038 MCP não tem ferramenta que altere previstas", () => {
  it("a lista fechada de ferramentas só lê previstas (previstas_do_mes); a escrita é apenas lancar_despesa", async () => {
    const { mcpTools } = await import("@/modules/mcp/tools");
    const names = mcpTools.map((t) => t.name);
    expect(names).toContain("previstas_do_mes");
    expect(names.filter((n) => /prevista|serie|recorr/.test(n))).toEqual(["previstas_do_mes"]);
    expect(names.filter((n) => /^(lancar|editar|alterar|excluir|baixa|pagar)/.test(n))).toEqual([
      "lancar_despesa",
    ]);
  });
});
