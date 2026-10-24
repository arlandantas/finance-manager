import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeTransaction,
} from "../support/factories";
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";

// US-077 (SDD-027 §5, rev. 2): atividade do assistente. Um evento = um item; nunca o conteúdo devolvido.
const db = testDb();
const NOW = "2026-11-15T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let token: string;
let grantId: string;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const activity = (as: ReturnType<typeof lucas>, qs = "") =>
  at(() => call(as, "GET", `/api/v1/assistant/activity${qs}`));

async function seedEvent(o: {
  kind?: "TOOL" | "CONNECTED" | "REVOKED" | "BLOCKED" | "LIMITS_CHANGED";
  tool?: string | null;
  outcome?: "OK" | "LIMIT_EXCEEDED" | "ERROR";
  params?: Record<string, unknown>;
  transactionId?: string | null;
  createdAt: string;
  grant?: string | null;
  memberId?: string;
}) {
  return db.mcpAuditEvent.create({
    data: {
      familyId: fx.family.id,
      memberId: o.memberId ?? (fx.byName.Lucas?.memberId as string),
      grantId: o.grant === undefined ? grantId : o.grant,
      clientName: "Claude (teste)",
      kind: o.kind ?? "TOOL",
      tool: o.tool ?? null,
      params: (o.params ?? {}) as never,
      outcome: o.outcome ?? "OK",
      transactionId: o.transactionId ?? null,
      durationMs: 5,
      createdAt: new Date(o.createdAt),
    },
  });
}

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily();
  token = (
    await at(() => oauthDance({ member: lucas(), scopes: ["read", "write"], allowWrite: true }))
  ).accessToken;
  grantId = (await db.mcpGrant.findFirstOrThrow()).id;
});
afterEach(() => vi.unstubAllGlobals());

describe("lista de atividade", () => {
  it("3 consultas reais + 1 lançamento: itens com data, ferramenta e resultado; consulta sem valores", async () => {
    const acc = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 100000,
    });
    const t = await makeTransaction(fx, {
      account: acc,
      category: "Saúde",
      amountInCents: 8000,
      occurredOn: "2026-11-14",
      author: "Lucas",
      description: "Farmácia",
    });
    await at(async () => {
      await toolCall(token, "consultar_saldos");
      await toolCall(token, "resumo_do_mes", { period: "2026-11" });
      const cat = (
        await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Saúde" } })
      ).id;
      await toolCall(token, "gastos_por_categoria", { period: "2026-11", categoryId: cat });
    });
    await seedEvent({
      tool: "lancar_despesa",
      transactionId: t.id,
      createdAt: "2026-11-15T14:00:00Z",
    });

    const r = await activity(lucas());
    expect(r.status).toBe(200);
    const tools = r.body.items.filter((i: any) => i.kind === "TOOL");
    expect(tools).toHaveLength(4);
    expect(
      r.body.items.map((i: any) => i.kind).filter((k: string) => k === "CONNECTED"),
    ).toHaveLength(1);
    const gastos = tools.find((i: any) => i.tool === "gastos_por_categoria");
    expect(gastos).toMatchObject({
      toolLabel: "Consultou gastos por categoria",
      scopeText: "nov/2026 · Saúde",
      outcomeLabel: "Concluído",
      assistant: { grantId, label: "Meu Claude" },
    });
    // sem os valores devolvidos
    for (const c of tools.filter((i: any) => i.tool !== "lancar_despesa")) {
      expect(JSON.stringify(c)).not.toMatch(/inCents|balance|R\$/);
    }
    expect(gastos.transaction).toBeNull();

    // um lançamento = um item, com atalho
    const lanc = tools.filter((i: any) => i.tool === "lancar_despesa");
    expect(lanc).toHaveLength(1);
    expect(lanc[0]).toMatchObject({
      toolLabel: "Lançou despesa",
      transaction: { id: t.id, description: "Farmácia", amountInCents: 8000, deleted: false },
    });
    // ordem: mais recente primeiro
    const ats = r.body.items.map((i: any) => i.at);
    expect([...ats].sort().reverse()).toEqual(ats);
  });

  it("lançamento excluído depois continua na atividade ('excluído depois')", async () => {
    const acc = await makeAccount(fx, {
      name: "Itaú",
      owner: "Lucas",
      openingBalanceInCents: 100000,
    });
    const t = await makeTransaction(fx, {
      account: acc,
      category: "Saúde",
      amountInCents: 8000,
      occurredOn: "2026-11-14",
      author: "Lucas",
      description: "Farmácia",
      deleted: true,
    });
    await seedEvent({
      tool: "lancar_despesa",
      transactionId: t.id,
      createdAt: "2026-11-15T14:00:00Z",
    });
    const r = await activity(lucas());
    const it = r.body.items.find((i: any) => i.tool === "lancar_despesa");
    expect(it.transaction).toMatchObject({ description: "Farmácia", deleted: true });
  });

  it("bloqueio por limite e alteração de limite viram itens próprios", async () => {
    await seedEvent({
      tool: "lancar_despesa",
      outcome: "LIMIT_EXCEEDED",
      createdAt: "2026-11-15T13:00:00Z",
    });
    await seedEvent({
      kind: "LIMITS_CHANGED",
      grant: null,
      params: { field: "maxAmountPerTxCents", from: 50000, to: "none" },
      createdAt: "2026-11-15T13:30:00Z",
    });
    const r = await activity(lucas());
    const blocked = r.body.items.find((i: any) => i.outcome === "LIMIT_EXCEEDED");
    expect(blocked.outcomeLabel).toBe("Bloqueado pelo seu limite");
    const ch = r.body.items.find((i: any) => i.kind === "LIMITS_CHANGED");
    expect(ch.limitChange).toEqual({ field: "maxAmountPerTxCents", from: 50000, to: null });
    expect(ch.assistant).toEqual({ grantId: null, label: "Configurações" });
  });

  it("filtra por assistente e por período; intervalo inválido => 400; cursor inválido => 400", async () => {
    await seedEvent({ tool: "consultar_saldos", createdAt: "2026-11-14T12:00:00Z" });
    await seedEvent({ tool: "consultar_saldos", createdAt: "2026-10-20T12:00:00Z" });
    await seedEvent({ tool: "consultar_saldos", createdAt: "2026-08-01T12:00:00Z" });
    const week = await activity(lucas(), "?range=7d");
    expect(week.body.items.filter((i: any) => i.tool === "consultar_saldos")).toHaveLength(1);
    const month = await activity(lucas(), "?range=30d");
    expect(month.body.items.filter((i: any) => i.tool === "consultar_saldos")).toHaveLength(2);
    const custom = await activity(lucas(), "?from=2026-08-01&to=2026-08-01");
    expect(custom.body.items).toHaveLength(1);
    const onlyOther = await activity(lucas(), "?grantId=11111111-1111-4111-8111-111111111111");
    expect(onlyOther.body.items).toEqual([]);
    const mine = await activity(lucas(), `?grantId=${grantId}`);
    expect(mine.body.items.length).toBeGreaterThan(0);
    expect(mine.body.assistants).toEqual([{ grantId, label: "Meu Claude", status: "ACTIVE" }]);
    expect((await activity(lucas(), "?range=7d&from=2026-11-01&to=2026-11-02")).status).toBe(400);
    expect((await activity(lucas(), "?from=2025-01-01&to=2026-11-15")).status).toBe(400);
    expect((await activity(lucas(), "?cursor=xxx")).body.error.code).toBe("INVALID_CURSOR");
  });

  it("paginação por cursor sem repetição", async () => {
    for (let i = 0; i < 5; i++) {
      await seedEvent({ tool: "consultar_saldos", createdAt: `2026-11-14T12:00:0${i}Z` });
    }
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const r = await activity(lucas(), `?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      expect(r.status).toBe(200);
      ids.push(...r.body.items.map((i: any) => i.id));
      cursor = r.body.nextCursor;
    } while (cursor);
    expect(ids.length).toBe(6); // 5 consultas + CONNECTED
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("membro vê só a própria atividade: Mariana não vê nada de Lucas, nem com o grantId dele", async () => {
    await seedEvent({ tool: "consultar_saldos", createdAt: "2026-11-14T12:00:00Z" });
    const m = await activity(mariana());
    expect(m.body.items).toEqual([]);
    expect(m.body.assistants).toEqual([]);
    const spoof = await activity(mariana(), `?grantId=${grantId}`);
    expect(spoof.body.items).toEqual([]);
  });

  it("outra família não enxerga nada (nem pelo grantId)", async () => {
    await seedEvent({ tool: "consultar_saldos", createdAt: "2026-11-14T12:00:00Z" });
    const souza = await makeFamily({
      name: "Família Souza",
      members: [{ email: "paulo@souza.com", name: "Paulo Souza" }],
    });
    const p = souza.byName.Paulo?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
    const r = await activity(p, `?grantId=${grantId}`);
    expect(r.body.items).toEqual([]);
  });

  it("revogar a partir da atividade: o assistente passa a REVOKED na lista de assistentes e gera item", async () => {
    await at(() => call(lucas(), "POST", `/api/v1/assistant/connections/${grantId}/revoke`, {}));
    const r = await activity(lucas());
    expect(r.body.assistants[0].status).toBe("REVOKED");
    expect(r.body.items.map((i: any) => i.kind)).toContain("REVOKED");
    expect(r.body.items.find((i: any) => i.kind === "REVOKED").toolLabel).toBe(
      "Você revogou o assistente",
    );
  });

  it("não vaza cartão de outra família no texto do escopo", async () => {
    const card = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas" });
    await seedEvent({
      tool: "cartoes_e_faturas",
      params: { cardId: card.id },
      createdAt: "2026-11-14T12:00:00Z",
    });
    const r = await activity(lucas());
    expect(r.body.items.find((i: any) => i.tool === "cartoes_e_faturas").scopeText).toBe(
      "Nubank Lucas",
    );
  });
});
