import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call } from "../support/call";
import { makeCard, makeFamily } from "../support/factories";
import { oauthDance, toolCall } from "../support/mcp-client";
import {
  at,
  db,
  decide,
  grantOf,
  lucas,
  MIN,
  mariana,
  propor,
  setupWorld,
  T0,
  txCount,
  w,
} from "../support/us076c-world";

// US-076c: limites de propostas, modo por conexão, retenção e LGPD.
beforeEach(setupWorld);
afterEach(() => vi.unstubAllGlobals());

describe("limites de propostas por conexão", () => {
  it("máx. 10 pendentes; vencidas não contam", async () => {
    for (let i = 0; i < 10; i++)
      expect((await propor({ description: `Item ${i}` })).err).toBeUndefined();
    expect((await propor({ description: "Item 11" })).err?.code).toBe("LIMIT_EXCEEDED");
    expect((await propor({ description: "Item 11" }, 31 * MIN)).err).toBeUndefined();
  });

  it("máx. 20 propostas por hora", async () => {
    for (let i = 0; i < 20; i++) {
      const r = await propor({ description: `Item ${i}` }, i * MIN);
      expect(r.err).toBeUndefined();
      if (i % 5 === 4) {
        await decide(lucas, r.sc.proposalId, "reject", i * MIN);
        for (const p of await db.assistantProposal.findMany({ where: { status: "PENDING" } })) {
          await db.assistantProposal.update({
            where: { id: p.id },
            data: { status: "REJECTED", decidedAt: new Date(T0) },
          });
        }
      }
    }
    expect((await propor({ description: "Item 21" }, 21 * MIN)).err?.code).toBe("LIMIT_EXCEEDED");
  });
});

describe("modo por conexão e retenção", () => {
  it("só o dono liga/desliga (404 para outro), com auditoria; vem no DTO", async () => {
    const g = await grantOf("Direto");
    const path = `/api/v1/assistant/connections/${g.id}/confirmation`;
    expect((await call(lucas(), "PATCH", path, { requireConfirmation: true })).status).toBe(404);
    const r = await call(mariana(), "PATCH", path, { requireConfirmation: true });
    expect(r.body.connection.requireConfirmation).toBe(true);
    expect((await call(mariana(), "PATCH", path, { requireConfirmation: true, x: 1 })).status).toBe(
      400,
    );
    expect(
      await db.mcpAuditEvent.count({ where: { tool: "modo_confirmacao", grantId: g.id } }),
    ).toBe(1);
    const s = await call(mariana(), "GET", "/api/v1/assistant/settings");
    expect(s.body.items.find((i: { id: string }) => i.id === g.id).requireConfirmation).toBe(true);
  });

  it("padrão desligado", async () => {
    expect((await grantOf("Direto")).requireConfirmation).toBe(false);
  });

  it("expurgo apaga não confirmadas com mais de 30 dias e mantém confirmadas", async () => {
    const { purgeMcp } = await import("@/modules/mcp/purge");
    const a = await propor();
    await propor({ description: "Outra" });
    await decide(lucas, a.sc.proposalId, "confirm", MIN);
    await db.$executeRaw`UPDATE assistant_proposals SET "createdAt" = ${new Date(T0 - 40 * 86_400_000)}`;
    const n = await db.$transaction((tx) => purgeMcp(tx, new Date(T0 + 5 * MIN)));
    expect(n.proposals).toBe(1);
    expect(await db.assistantProposal.count()).toBe(1);
  });

  it("CHECKs: origem do lançamento e forma da proposta", async () => {
    const a = await propor();
    await expect(
      db.$executeRaw`UPDATE assistant_proposals SET "accountId" = "cardId" WHERE id = ${a.sc.proposalId}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE assistant_proposals SET status = 'CONFIRMED' WHERE id = ${a.sc.proposalId}::uuid`,
    ).rejects.toThrow();
  });
});

describe("LGPD: exclusão de conta e de família", () => {
  it("excluir a conta apaga propostas não confirmadas e mantém as confirmadas", async () => {
    const a = await propor();
    await propor({ description: "Outra" });
    await decide(lucas, a.sc.proposalId, "confirm", MIN);
    const itau = await db.bankAccount.findFirstOrThrow({ where: { name: "Itaú Lucas" } });
    const mid = w.fx.byName.Mariana?.memberId as string;
    const r = await at(0, () =>
      call(lucas(), "POST", "/api/v1/me/delete-account", {
        confirmEmail: lucas().email,
        reassign: { accounts: { [itau.id]: mid }, cards: { [w.nubank.id]: mid } },
      }),
    );
    expect(r.status).toBe(200);
    const left = await db.assistantProposal.findMany();
    expect(left.map((p) => p.status)).toEqual(["CONFIRMED"]);
  });

  it("excluir a família com propostas (pendente e confirmada) não falha por FK", async () => {
    const solo = await makeFamily({
      name: "Família Souza",
      uniqueEmails: true,
      members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    });
    const ana = solo.members[0]?.as as ReturnType<typeof lucas>;
    const card = await makeCard(solo, {
      name: "Nubank Ana",
      owner: "Ana",
      limitInCents: 1_000_000,
    });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: solo.family.id, name: "Saúde" },
    });
    const tk = (
      await at(0, () =>
        oauthDance({ member: ana, scopes: ["read", "write"], allowWrite: true, label: "Ana" }),
      )
    ).accessToken;
    await db.mcpGrant.updateMany({ where: { label: "Ana" }, data: { requireConfirmation: true } });
    const mk = async (description: string) =>
      (
        await at(0, () =>
          toolCall(tk, "propor_lancamento", {
            description,
            amountInCents: 5000,
            categoryId: cat.id,
            cardId: card.id,
          }),
        )
      ).body.result.structuredContent.proposalId as string;
    const first = await mk("Farmácia");
    await mk("Outra");
    expect((await decide(() => ana, first, "confirm", MIN)).status).toBe(200);
    const r = await at(0, () =>
      call(ana, "POST", "/api/v1/family/delete", { confirmFamilyName: "Família Souza" }),
    );
    expect(r.status).toBe(200);
    expect(await db.assistantProposal.count({ where: { familyId: solo.family.id } })).toBe(0);
  });
});
