import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeTransaction,
  makeUnlinkedMember,
} from "../support/factories";

// US-093a (SDD-034 §3, §7.2): titular sem conta só por ADMIN; acerto sem mudar motor (U1, U5, U6).
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let ana: { memberId: string; name: string };
const as = (n: "Mariana" | "Lucas" | "Bia") => fx.byName[n]?.as ?? null;
const id = (n: string) => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "bia@exemplo.com", name: "Bia Silva", role: "MEMBER" },
    ],
  });
  ana = await makeUnlinkedMember(fx, { name: "Ana", register: true });
});

const newAccount = (who: "Mariana" | "Lucas" | "Bia", ownerMemberId: string) =>
  at(() =>
    call(as(who), "POST", "/api/v1/accounts", {
      name: `Conta ${who} ${Math.random().toString(36).slice(2, 6)}`,
      type: "CHECKING",
      ownerMemberId,
    }),
  );
const newCard = (who: "Mariana" | "Lucas" | "Bia", ownerMemberId: string) =>
  at(() =>
    call(as(who), "POST", "/api/v1/cards", {
      name: `Cartão ${who} ${Math.random().toString(36).slice(2, 6)}`,
      limitInCents: 100000,
      closingDay: 25,
      dueDay: 5,
      ownerMemberId,
    }),
  );
const patchCard = (
  who: "Mariana" | "Lucas" | "Bia",
  cardId: string,
  body: Record<string, unknown>,
) => at(() => call(as(who), "PATCH", `/api/v1/cards/${cardId}`, body));

describe("093a titular sem conta (D-034-6)", () => {
  it("ADMIN cria conta e cartão com titular Ana: 201 e owner.unlinked", async () => {
    const a = await newAccount("Mariana", ana.memberId);
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.owner).toMatchObject({ id: ana.memberId, unlinked: true });
    const c = await newCard("Mariana", ana.memberId);
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.card.owner).toMatchObject({ id: ana.memberId, unlinked: true });
  });

  it("MEMBER cria conta/cartão com titular Ana: 422 UNLINKED_OWNER_ADMIN_ONLY, nada gravado", async () => {
    const a = await newAccount("Lucas", ana.memberId);
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe("UNLINKED_OWNER_ADMIN_ONLY");
    expect(a.body.error.details?.[0]?.path).toBe("ownerMemberId");
    const c = await newCard("Lucas", ana.memberId);
    expect(c.status).toBe(422);
    expect(c.body.error.code).toBe("UNLINKED_OWNER_ADMIN_ONLY");
    expect(await db.bankAccount.count()).toBe(0);
    expect(await db.creditCard.count()).toBe(0);
  });

  it("MEMBER com titular próprio/outro membro com conta continua 201", async () => {
    expect((await newAccount("Lucas", id("Lucas"))).status).toBe(201);
    expect((await newCard("Lucas", id("Bia"))).status).toBe(201);
  });

  it("cartão de Ana: MEMBER troca => 403 CARD_OWNER_ONLY; ADMIN troca para Lucas => 200 + evento do ADMIN", async () => {
    const card = await makeCard(fx, { name: "Cartão da Ana", owner: "Ana" });
    const denied = await patchCard("Lucas", card.id, { version: 1, ownerMemberId: id("Bia") });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("CARD_OWNER_ONLY");
    expect(denied.body.error.message).toBe(
      "Só um Administrador pode trocar o titular deste cartão.",
    );
    const ok = await patchCard("Mariana", card.id, { version: 1, ownerMemberId: id("Lucas") });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "CARD_OWNER_CHANGED" } });
    expect(ev.actorMemberId).toBe(id("Mariana"));
    expect(ev.targetMemberId).toBe(id("Lucas"));
    expect(ev.changes).toMatchObject({ fromMemberId: ana.memberId, toMemberId: id("Lucas") });
  });

  it("cartão de Lucas: Lucas passa a Ana => 422; ADMIN titular passa o próprio a Ana => 200; ADMIN não titular não troca cartão alheio com conta", async () => {
    const lucasCard = await makeCard(fx, { name: "Cartão Lucas", owner: "Lucas" });
    const toAna = await patchCard("Lucas", lucasCard.id, {
      version: 1,
      ownerMemberId: ana.memberId,
    });
    expect(toAna.status).toBe(422);
    expect(toAna.body.error.code).toBe("UNLINKED_OWNER_ADMIN_ONLY");
    const adminOther = await patchCard("Mariana", lucasCard.id, {
      version: 1,
      ownerMemberId: ana.memberId,
    });
    expect(adminOther.status).toBe(403);
    expect(adminOther.body.error.code).toBe("CARD_OWNER_ONLY");
    expect(adminOther.body.error.message).toBe("Só o titular do cartão pode trocar o titular.");
    const own = await makeCard(fx, { name: "Cartão Mariana", owner: "Mariana" });
    const ok = await patchCard("Mariana", own.id, { version: 1, ownerMemberId: ana.memberId });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.card.owner).toMatchObject({ id: ana.memberId, unlinked: true });
  });

  it("canário ADR-018: titular sem conta de OUTRA família => 422 INVALID_REFERENCE (nunca 201)", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const alien = await makeUnlinkedMember(other, { name: "Zeca" });
    for (const make of [newAccount, newCard]) {
      const res = await make("Mariana", alien.memberId);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("INVALID_REFERENCE");
    }
  });

  it("ex-membro sem conta não é titular candidato: 422 INVALID_REFERENCE", async () => {
    const gone = await makeUnlinkedMember(fx, { name: "Edu", removedAt: new Date() });
    expect((await newAccount("Mariana", gone.memberId)).body.error.code).toBe("INVALID_REFERENCE");
  });
});

describe("093a acerto com membro sem conta (motor intacto)", () => {
  beforeEach(async () => {
    await resetDb();
    fx = await makeFamily(); // Mariana (ADMIN) e Lucas: com Ana, são três membros (U1 do SDD-034 §5)
    ana = await makeUnlinkedMember(fx, { name: "Ana", register: true });
  });
  async function ana300() {
    const conta = await makeAccount(fx, {
      name: "Conta Ana",
      owner: "Ana",
      openingBalanceInCents: 0,
    });
    await makeTransaction(fx, {
      account: conta,
      category: "Supermercado",
      amountInCents: 30000,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Ana",
    });
    return conta;
  }
  const panel = () => at(() => call(as("Mariana"), "GET", "/api/v1/settlement"));

  it("U1: Ana paga 300 entre três: Ana +200, Mariana/Lucas -100; sugestões para Ana; selo no DTO", async () => {
    await ana300();
    const res = await panel();
    expect(res.status).toBe(200);
    const bal = (n: string) =>
      res.body.members.find((m: { member: { id: string } }) => m.member.id === id(n));
    expect(bal("Ana").balanceInCents).toBe(20000);
    expect(bal("Ana").member.unlinked).toBe(true);
    expect(bal("Mariana").balanceInCents).toBe(-10000);
    expect(bal("Lucas").balanceInCents).toBe(-10000);
    expect(
      res.body.suggestions
        .map((s: { from: { name: string }; to: { name: string }; amountInCents: number }) => [
          s.from.name,
          s.to.name,
          s.amountInCents,
        ])
        .sort(),
    ).toEqual([
      ["Lucas Silva", "Ana", 10000],
      ["Mariana Silva", "Ana", 10000],
    ]);
  });

  it("U5: Mariana registra 50,00 para Ana (destino conta de Ana): Ana +150, Mariana -50", async () => {
    const conta = await ana300();
    const origem = await makeAccount(fx, {
      name: "Conta Mariana",
      owner: "Mariana",
      openingBalanceInCents: 100000,
    });
    const res = await at(() =>
      call(as("Mariana"), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: id("Mariana"),
        toMemberId: ana.memberId,
        amountInCents: 5000,
        fromAccountId: origem.id,
        toAccountId: conta.id,
      }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const p = await panel();
    const bal = (n: string) =>
      p.body.members.find((m: { member: { id: string } }) => m.member.id === id(n)).balanceInCents;
    expect(bal("Ana")).toBe(15000);
    expect(bal("Mariana")).toBe(-5000);
  });

  it("U6: acerto desligado: /settlements 409 SETTLEMENT_DISABLED", async () => {
    const conta = await ana300();
    const outra = await makeAccount(fx, { name: "Conta Mariana", owner: "Mariana" });
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    const res = await at(() =>
      call(as("Mariana"), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: id("Mariana"),
        toMemberId: ana.memberId,
        amountInCents: 5000,
        fromAccountId: outra.id,
        toAccountId: conta.id,
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SETTLEMENT_DISABLED");
  });
});
