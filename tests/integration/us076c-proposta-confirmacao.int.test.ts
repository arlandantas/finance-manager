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

// US-076c (ADR-030 §6): modo "exigir confirmação" por conexão. O assistente só propõe; o membro confirma no app.
beforeEach(setupWorld);
afterEach(() => vi.unstubAllGlobals());

describe("AC1: com o modo ligado o pedido só cria proposta", () => {
  it("propor_lancamento cria PENDING e nenhum lançamento; lancar_despesa é recusada", async () => {
    const r = await propor({ idempotencyKey: "prop-abc-1" });
    expect(r.err).toBeUndefined();
    expect(r.sc).toMatchObject({ status: "PENDING", duplicate: false, amount: { inCents: 8000 } });
    expect(r.sc.reviewUrl).toBe(`http://localhost:3100/assistente/propostas/${r.sc.proposalId}`);
    expect(await txCount()).toBe(0);
    const p = await db.assistantProposal.findFirstOrThrow();
    expect(p).toMatchObject({
      status: "PENDING",
      description: "Farmácia",
      memberId: w.fx.byName.Lucas?.memberId,
    });
    expect(p.expiresAt.getTime()).toBe(T0 + 30 * MIN);
    const direct = await at(0, () =>
      toolCall(w.token, "lancar_despesa", {
        description: "Farmácia",
        amountInCents: 8000,
        categoryId: w.saude,
        cardId: w.nubank.id,
      }),
    );
    expect(direct.body.result.structuredContent.error.code).toBe("CONFIRMATION_REQUIRED");
    expect(await txCount()).toBe(0);
  });

  it("não existe ferramenta de confirmar; auditoria registra TOOL propor_lancamento com proposalId", async () => {
    const list = await at(0, () =>
      import("../support/mcp-client").then((m) => m.mcpCall(w.token, "tools/list", {})),
    );
    const names = list.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("propor_lancamento");
    expect(names).toContain("consultar_proposta");
    expect(names.filter((n: string) => /confirm|aprov|decid/i.test(n))).toEqual([]);
    const r = await propor();
    const ev = await db.mcpAuditEvent.findFirstOrThrow({ where: { tool: "propor_lancamento" } });
    expect(ev).toMatchObject({ outcome: "OK", proposalId: r.sc.proposalId, kind: "TOOL" });
    expect(JSON.stringify(ev.params)).not.toContain("Farmácia");
  });

  it("modo desligado: propor é recusada e lancar_despesa continua direta (AC4)", async () => {
    const r = await propor({ cardId: w.marianaCard.id }, 0, w.directToken);
    expect(r.err?.code).toBe("CONFIRMATION_MODE_OFF");
    const ok = await at(0, () =>
      toolCall(w.directToken, "lancar_despesa", {
        description: "Farmácia",
        amountInCents: 8000,
        categoryId: w.saude,
        cardId: w.nubank.id,
      }),
    );
    expect(ok.body.result.isError).toBeFalsy();
    expect(await txCount()).toBe(1);
  });

  it("idempotencyKey repetida devolve a mesma proposta; com outro conteúdo é erro", async () => {
    const a = await propor({ idempotencyKey: "same-key-1" });
    const b = await propor({ idempotencyKey: "same-key-1" });
    expect(b.sc).toMatchObject({ proposalId: a.sc.proposalId, duplicate: true });
    const c = await propor({ idempotencyKey: "same-key-1", amountInCents: 9000 });
    expect(c.err?.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await db.assistantProposal.count()).toBe(1);
  });

  it("consultar_proposta mostra o estado e só da própria conexão", async () => {
    const a = await propor();
    const q = (bearer: string, offset = 0) =>
      at(offset, () => toolCall(bearer, "consultar_proposta", { proposalId: a.sc.proposalId }));
    expect((await q(w.token)).body.result.structuredContent).toMatchObject({
      status: "PENDING",
      transactionId: null,
    });
    expect((await q(w.token, 31 * MIN)).body.result.structuredContent.status).toBe("EXPIRED");
    expect((await q(w.directToken)).body.result.isError).toBe(true);
  });
});

describe("AC2/AC5: confirmar no app", () => {
  it("grava o lançamento 'via assistente' com vínculo, auditoria e respeita idempotência", async () => {
    const a = await propor();
    const id = a.sc.proposalId as string;
    const r = await decide(lucas, id, "confirm", 2 * MIN, "11111111-1111-4111-8111-111111111111");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ alreadyConfirmed: false, proposal: { status: "CONFIRMED" } });
    const t = await db.transaction.findFirstOrThrow({ where: { origin: "ASSISTANT" } });
    expect(t).toMatchObject({
      description: "Farmácia",
      isSharedExpense: false,
      assistantProposalId: id,
      cardId: w.nubank.id,
      authorMemberId: w.fx.byName.Lucas?.memberId,
    });
    expect(Number(t.amountInCents)).toBe(8000);
    expect((await db.assistantProposal.findFirstOrThrow()).transactionId).toBe(t.id);
    const ev = await db.mcpAuditEvent.findFirstOrThrow({ where: { tool: "confirmacao_no_app" } });
    expect(ev).toMatchObject({ proposalId: id, transactionId: t.id, outcome: "OK" });
    // segunda confirmação, com outra chave: mesmo lançamento
    const again = await decide(lucas, id, "confirm", 3 * MIN);
    expect(again.status).toBe(200);
    expect(again.body.alreadyConfirmed).toBe(true);
    expect(await txCount()).toBe(1);
    // confirmações simultâneas
    const b = await propor({ description: "Padaria" });
    const both = await Promise.all([
      decide(lucas, b.sc.proposalId, "confirm", 4 * MIN),
      decide(lucas, b.sc.proposalId, "confirm", 4 * MIN),
    ]);
    expect(both.map((x) => x.status)).toEqual([200, 200]);
    expect(await txCount()).toBe(2);
  });

  it("respeita os limites do membro (US-076b) e a proposta continua pendente", async () => {
    await db.memberAssistantLimits.create({
      data: {
        familyId: w.fx.family.id,
        memberId: w.fx.byName.Lucas?.memberId as string,
        maxAmountPerTxCents: 5000n,
        maxTxPerDay: 10,
        maxTxPerHour: 5,
      },
    });
    const a = await propor();
    const r = await decide(lucas, a.sc.proposalId, "confirm", MIN);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("LIMIT_EXCEEDED");
    expect(await txCount()).toBe(0);
    expect((await db.assistantProposal.findFirstOrThrow()).status).toBe("PENDING");
  });

  it("cartão arquivado entre proposta e confirmação falha com a mensagem do domínio", async () => {
    const a = await propor();
    await db.creditCard.update({ where: { id: w.nubank.id }, data: { archivedAt: new Date(T0) } });
    const r = await decide(lucas, a.sc.proposalId, "confirm", MIN);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("INVALID_REFERENCE");
    expect(await txCount()).toBe(0);
  });

  it("outro membro ou outra família não vê nem decide (404); idempotency key é obrigatória", async () => {
    const a = await propor();
    expect((await decide(mariana, a.sc.proposalId, "confirm")).status).toBe(404);
    expect(
      (await at(0, () => call(mariana(), "GET", `/api/v1/assistant/proposals/${a.sc.proposalId}`)))
        .status,
    ).toBe(404);
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const o = other.byName.Lucas?.as as ReturnType<typeof lucas>;
    expect(
      (
        await at(0, () =>
          call(o, "POST", `/api/v1/assistant/proposals/${a.sc.proposalId}/reject`, {}),
        )
      ).status,
    ).toBe(404);
    const noKey = await at(0, () =>
      call(
        lucas(),
        "POST",
        `/api/v1/assistant/proposals/${a.sc.proposalId}/confirm`,
        {},
        { idempotencyKey: null },
      ),
    );
    expect(noKey.status).toBe(400);
  });
});

describe("AC3: recusar e expirar", () => {
  it("recusar descarta; confirmar depois é conflito", async () => {
    const a = await propor();
    const r = await decide(lucas, a.sc.proposalId, "reject", MIN);
    expect(r.body.proposal.status).toBe("REJECTED");
    expect((await decide(lucas, a.sc.proposalId, "confirm", 2 * MIN)).status).toBe(409);
    expect(await txCount()).toBe(0);
    expect(await db.mcpAuditEvent.count({ where: { tool: "recusa_no_app" } })).toBe(1);
  });

  it("expira em 30 minutos sem gerar lançamento; GET grava EXPIRED", async () => {
    const a = await propor();
    const c = await decide(lucas, a.sc.proposalId, "confirm", 31 * MIN);
    expect(c.status).toBe(409);
    expect(c.body.error.code).toBe("PROPOSAL_EXPIRED");
    const g = await at(31 * MIN, () =>
      call(lucas(), "GET", `/api/v1/assistant/proposals/${a.sc.proposalId}`),
    );
    expect(g.body.proposal.status).toBe("EXPIRED");
    expect((await db.assistantProposal.findFirstOrThrow()).status).toBe("EXPIRED");
    expect(await txCount()).toBe(0);
  });

  it("confirmar a proposta de uma conexão revogada falha", async () => {
    const a = await propor();
    await db.mcpGrant.update({
      where: { id: (await grantOf("Com confirmação")).id },
      data: { status: "REVOKED", revokedAt: new Date(T0), revokedReason: "MEMBER" },
    });
    expect((await decide(lucas, a.sc.proposalId, "confirm", MIN)).status).toBe(409);
  });
});
