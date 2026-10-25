import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

// Reteste da rodada 6 (reteste-rodada6-2026-10-26): SEC-047..050 (D-GES-57). As provas do relatório viram regressão.
// SEC-047 (titular do cartão) está em sec042-046-so-meu-reteste.int.test.ts.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accCarla: AccountFixture;
let accMariana: AccountFixture;
const as = (n: string) => fx.byName[n]?.as ?? null;
const idOf = (n: string) => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "carla@exemplo.com", name: "Carla Silva", role: "MEMBER" },
      { email: "bia@exemplo.com", name: "Bia Silva", role: "MEMBER" },
    ],
  });
  accCarla = await makeAccount(fx, {
    name: "Conta da Carla",
    owner: "Carla",
    openingBalanceInCents: 100000,
  });
  accMariana = await makeAccount(fx, {
    name: "Conta da Mariana",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
});

const removeLucas = () =>
  db.member.update({
    where: { id: idOf("Lucas") },
    data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
  });
const mk = (amountInCents = 30000, description = "Farmácia") =>
  makeTransaction(fx, {
    account: accCarla,
    category: "Supermercado",
    amountInCents,
    occurredOn: "2026-10-02",
    payer: "Lucas",
    author: "Lucas",
    shared: false,
    description,
  });
const patch = (who: string, id: string, version: number, body: Record<string, unknown>) =>
  at(() => call(as(who), "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));
const txRow = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });
type SRow = { member: { name: string }; differenceInCents: number };
const settlement = async (who = "Bia") => {
  const res = await at(() => call(as(who), "GET", "/api/v1/settlement?period=2026-10"));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.members as SRow[];
};

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-048 ao dividir o 'Só meu' de ex-membro, o pagador continua o ex-membro", () => {
  it("prova do relatório: Admin dividir e se pôr como pagador (ou outro ativo) ⇒ 403; o acerto não muda", async () => {
    const t = await mk();
    await removeLucas();
    const before = await settlement();
    for (const body of [
      { isSharedExpense: true, payerMemberId: idOf("Mariana"), accountId: accMariana.id },
      { isSharedExpense: true, payerMemberId: idOf("Carla") },
      { isSharedExpense: true, payerMemberId: idOf("Bia") },
    ]) {
      const res = await patch("Mariana", t.id, 1, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
      expect(res.body.error.message).toMatch(/ex-membro e não pode ser alterado/); // D-GES-59
    }
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(false);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accCarla.id);
    expect(row.version).toBe(1);
    expect(await settlement()).toEqual(before);
  });

  it("só dividir (ou reenviar o próprio ex-membro como pagador) vale: o pagador continua Lucas e ele é o credor", async () => {
    const a = await mk(30000, "Farmácia");
    const b = await mk(10000, "Terapia");
    await removeLucas();
    expect((await patch("Mariana", a.id, 1, { isSharedExpense: true })).status).toBe(200);
    const same = await patch("Mariana", b.id, 1, {
      isSharedExpense: true,
      payerMemberId: idOf("Lucas"),
      accountId: accMariana.id,
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
    for (const id of [a.id, b.id]) {
      const row = await txRow(id);
      expect(row.isSharedExpense).toBe(true);
      expect(row.payerMemberId).toBe(idOf("Lucas"));
    }
    const rows = await settlement();
    const get = (n: string) => rows.find((r) => r.member.name.startsWith(n))?.differenceInCents;
    expect(get("Mariana")).toBeLessThan(0); // Mariana não ganha crédito algum
    expect(get("Lucas")).toBeGreaterThan(0);
  });

  it("D-GES-59 revoga o DEV-129: o Admin não assume nem entrega o pagador do 'Só meu' de ex-membro (403)", async () => {
    const t = await mk();
    await removeLucas();
    for (const who of ["Mariana", "Carla"]) {
      const res = await patch("Mariana", t.id, 1, { payerMemberId: idOf(who) });
      expect(res.status, who).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Lucas"));
  });

  it("prevista e série: dividir mantém o responsável ex-membro; trocar o responsável ao dividir ⇒ 403", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    const created = await at(() =>
      call(as("Lucas"), "POST", "/api/v1/recurring-expenses", {
        description: "Academia",
        amountInCents: 10000,
        categoryId: cat.id,
        isSharedExpense: false,
        paymentAccountId: accCarla.id,
        dayOfMonth: 5,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 2 },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    await removeLucas();
    const pUrl = `/api/v1/planned-expenses/${p.id}`;
    const sUrl = `/api/v1/recurring-expenses/${s.id}`;
    for (const [url, version] of [
      [pUrl, 1],
      [sUrl, s.version],
    ] as const) {
      for (const who of ["Mariana", "Carla"]) {
        const res = await at(() =>
          call(as(who), "PATCH", url, {
            version,
            isSharedExpense: true,
            responsibleMemberId: idOf(who),
          }),
        );
        expect(res.status, `${who} ${url}`).toBe(403);
      }
    }
    expect(
      (await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
    const okP = await at(() =>
      call(as("Mariana"), "PATCH", pUrl, { version: 1, isSharedExpense: true }),
    );
    expect(okP.status, JSON.stringify(okP.body)).toBe(200);
    const okS = await at(() =>
      call(as("Mariana"), "PATCH", sUrl, {
        version: s.version,
        isSharedExpense: true,
        responsibleMemberId: idOf("Lucas"),
      }),
    );
    expect(okS.status, JSON.stringify(okS.body)).toBe(200);
    expect(
      (await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
    expect(
      (await db.recurringExpense.findUniqueOrThrow({ where: { id: s.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-049 quem volta à família recupera o controle do próprio 'Só meu' antigo", () => {
  type Caller = NonNullable<ReturnType<typeof as>>;
  const removeViaApi = async () =>
    expect(
      (await at(() => call(as("Mariana"), "POST", `/api/v1/members/${idOf("Lucas")}/remove`, {})))
        .status,
    ).toBe(200);
  // a remoção pela API reatribui as previstas ao Admin (US-035); para testar a prevista do ex-membro, remove-se no banco
  const removeInDb = removeLucas;
  /** Fluxo real: o Admin reconvida e a pessoa aceita; nasce um vínculo NOVO (US-035). */
  const rejoinLucas = async (): Promise<Caller & { name: string | null }> => {
    const inv = await at(() =>
      call(as("Mariana"), "POST", "/api/v1/invitations", {
        email: "lucas@exemplo.com",
        role: "MEMBER",
      }),
    );
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const lucasAs = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    const res = await at(() =>
      call(lucasAs, "POST", `/api/v1/me/invitations/${inv.body.invitation.id}/accept`, {}),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return lucasAs;
  };
  const patchAs = (
    who: Caller | null,
    id: string,
    version: number,
    body: Record<string, unknown>,
  ) => at(() => call(who, "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));

  it("prova do relatório: antes do retorno o Admin é 403; remover dá poder pleno; ao voltar, o Admin perde e Lucas recupera", async () => {
    const farm = await mk(30000, "Farmácia");
    const ter = await mk(10000, "Terapia");
    const grab = { isSharedExpense: true, payerMemberId: idOf("Mariana") };
    expect((await patch("Mariana", ter.id, 1, grab)).status).toBe(403); // passo 1
    expect((await patch("Mariana", ter.id, 1, { amountInCents: 1 })).status).toBe(403);
    await removeViaApi(); // passo 2
    // enquanto ex-membro, o Admin tem o poder pleno de D-GES-55 (sem se pôr como pagador de dividida, SEC-048)
    expect((await patch("Mariana", ter.id, 1, grab)).status).toBe(403);
    expect((await patch("Mariana", ter.id, 1, { amountInCents: 10100 })).status).toBe(200);
    const lucas = await rejoinLucas(); // passo 4
    const oldId = idOf("Lucas");
    const newMember = await db.member.findFirstOrThrow({
      where: { userId: lucas.userId, removedAt: null },
    });
    expect(newMember.id).not.toBe(oldId);
    // passo 3 repetido: o Admin perde o poder pleno sobre o item de quem voltou
    for (const body of [
      { isSharedExpense: true },
      { payerMemberId: idOf("Mariana") },
      { accountId: accMariana.id },
      { amountInCents: 10200 },
      { description: "editado pela Admin" },
    ]) {
      const res = await patch("Mariana", ter.id, 2, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
    // Bia não controla; Carla (dona da conta) só altera valor/descrição, nunca a estrutura (D-GES-53)
    expect((await patch("Bia", ter.id, 2, { amountInCents: 10300 })).status).toBe(403);
    expect((await patch("Carla", ter.id, 2, { isSharedExpense: true })).status).toBe(403);
    const row = await txRow(ter.id);
    expect(row.payerMemberId).toBe(oldId);
    expect(row.amountInCents).toBe(10100n);
    expect(row.version).toBe(2);
    // passo 5: o Lucas novo edita, divide, exclui e restaura o próprio "Só meu" antigo
    const edit = await patchAs(lucas, ter.id, 2, { amountInCents: 10400, note: "minha anotação" });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const del = await at(() =>
      call(lucas, "POST", `/api/v1/transactions/${ter.id}/delete`, { version: 3 }),
    );
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    const restore = await at(() =>
      call(lucas, "POST", `/api/v1/transactions/${ter.id}/restore`, { version: 4 }),
    );
    expect(restore.status, JSON.stringify(restore.body)).toBe(200);
    const share = await patchAs(lucas, ter.id, 5, { isSharedExpense: true });
    expect(share.status, JSON.stringify(share.body)).toBe(200);
    // o outro item, ainda "Só meu": entrega a terceiro continua proibida mesmo para o dono
    const toBia = await patchAs(lucas, farm.id, 1, { payerMemberId: idOf("Bia") });
    expect(toBia.status).toBe(403);
    expect(toBia.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("DTO e UI: o vínculo antigo aponta o vínculo ativo (activeId); o Admin não é mais tratado como poderoso", async () => {
    const t = await mk();
    await removeViaApi();
    const lucas = await rejoinLucas();
    const newMember = await db.member.findFirstOrThrow({
      where: { userId: lucas.userId, removedAt: null },
    });
    const detail = await at(() => call(lucas, "GET", `/api/v1/transactions/${t.id}`));
    expect(detail.status).toBe(200);
    expect(detail.body.transaction.payer).toMatchObject({
      id: idOf("Lucas"),
      removed: true,
      activeId: newMember.id,
    });
    // quem não voltou não tem activeId
    const other = await mk(1000, "Outro");
    await db.transaction.update({ where: { id: other.id }, data: { payerMemberId: idOf("Bia") } });
    await db.member.update({
      where: { id: idOf("Bia") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    const gone = await at(() => call(as("Mariana"), "GET", `/api/v1/transactions/${other.id}`));
    expect(gone.body.transaction.payer.activeId).toBeUndefined();
  });

  it("quem voltou também age no próprio 'Só meu' sem ser Admin e sem trocar a conta dos outros: IDOR e terceiros", async () => {
    const t = await mk();
    await removeViaApi();
    const lucas = await rejoinLucas();
    // outro usuário (mesmo com vínculo ativo na família) segue sem poder
    expect((await patch("Bia", t.id, 1, { amountInCents: 5 })).status).toBe(403);
    // Lucas não pega o "Só meu" de OUTRA pessoa só por ter um vínculo antigo
    const carlas = await mk(7000, "Da Carla");
    await db.transaction.update({
      where: { id: carlas.id },
      data: { payerMemberId: idOf("Carla"), authorMemberId: idOf("Carla") },
    });
    expect((await patchAs(lucas, carlas.id, 1, { amountInCents: 5 })).status).toBe(403);
    expect((await patchAs(lucas, carlas.id, 1, { payerMemberId: idOf("Lucas") })).status).toBe(403);
    // conta de outra família continua inválida mesmo para o dono
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    const otherAcc = await makeAccount(other, {
      name: "Conta alheia",
      owner: other.members[0]?.name ?? "",
    });
    const bad = await patchAs(lucas, t.id, 1, { accountId: otherAcc.id });
    expect([404, 422]).toContain(bad.status);
    expect((await txRow(t.id)).accountId).toBe(accCarla.id);
  });

  it("usuário com vínculo ativo em OUTRA família não recupera o item: segue ex-membro aqui (Admin mantém D-GES-55) e o 'Só meu' é inalcançável a ele", async () => {
    const t = await mk();
    await removeViaApi();
    const lucasUser = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    await db.member.create({
      data: { familyId: other.family.id, userId: lucasUser.id, role: "MEMBER" },
    });
    const lucasElsewhere = await asUser("lucas@exemplo.com");
    // da outra família, o lançamento desta família é inexistente (IDOR)
    expect((await patchAs(lucasElsewhere, t.id, 1, { amountInCents: 5 })).status).toBe(404);
    // aqui continua sem vínculo ativo: o Admin segue com o D-GES-55 (editar) e Bia, 403
    expect((await patch("Bia", t.id, 1, { amountInCents: 5 })).status).toBe(403);
    expect((await patch("Mariana", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
  });

  it("previstas e séries: o Admin perde o poder pleno sobre o que é de quem voltou; ele mesmo controla", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    const created = await at(() =>
      call(as("Lucas"), "POST", "/api/v1/recurring-expenses", {
        description: "Academia",
        amountInCents: 10000,
        categoryId: cat.id,
        isSharedExpense: false,
        paymentAccountId: accCarla.id,
        dayOfMonth: 5,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 2 },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    await removeInDb();
    const lucas = await rejoinLucas();
    const pUrl = `/api/v1/planned-expenses/${p.id}`;
    const sUrl = `/api/v1/recurring-expenses/${s.id}`;
    for (const [url, version] of [
      [pUrl, 1],
      [sUrl, s.version],
    ] as const) {
      for (const body of [{ isSharedExpense: true }, { responsibleMemberId: idOf("Mariana") }]) {
        const res = await at(() => call(as("Mariana"), "PATCH", url, { version, ...body }));
        expect(res.status, `${url} ${JSON.stringify(body)}`).toBe(403);
      }
    }
    const pay = await at(() =>
      call(as("Mariana"), "POST", `${pUrl}/pay`, {
        version: 1,
        accountId: accMariana.id,
        payerMemberId: idOf("Mariana"),
      }),
    );
    expect(pay.status).toBe(403);
    const end = await at(() => call(as("Mariana"), "POST", `${sUrl}/end`, { version: s.version }));
    expect(end.status).toBe(403);
    // quem voltou controla as duas
    const editP = await at(() => call(lucas, "PATCH", pUrl, { version: 1, isSharedExpense: true }));
    expect(editP.status, JSON.stringify(editP.body)).toBe(200);
    const editS = await at(() =>
      call(lucas, "PATCH", sUrl, { version: s.version, isSharedExpense: true }),
    );
    expect(editS.status, JSON.stringify(editS.body)).toBe(200);
  });

  it("baixa de prevista 'Só meu' antiga por quem voltou: paga em nome do vínculo ativo", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Luz",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await removeInDb();
    const lucas = await rejoinLucas();
    const newMember = await db.member.findFirstOrThrow({
      where: { userId: lucas.userId, removedAt: null },
    });
    const ok = await at(() =>
      call(lucas, "POST", `/api/v1/planned-expenses/${p.id}/pay`, {
        version: 1,
        accountId: accCarla.id,
      }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await txRow(ok.body.transaction.id)).payerMemberId).toBe(newMember.id);
  });

  it("a exportação devolve o item ao arquivo de quem voltou e o Admin não o captura", async () => {
    const t = await mk(30000, "Terapia");
    await removeViaApi();
    const lucas = await rejoinLucas();
    expect((await patch("Mariana", t.id, 1, { payerMemberId: idOf("Mariana") })).status).toBe(403);
    const exp = await at(() => call(lucas, "GET", "/api/v1/me/export"));
    expect(exp.status).toBe(200);
    const mine = (exp.body.familiaAtual.lancamentos as Array<{ descricao: string }>).map(
      (l) => l.descricao,
    );
    expect(mine).toContain("Terapia");
    const adm = await at(() => call(as("Mariana"), "GET", "/api/v1/me/export"));
    expect(
      (adm.body.familiaAtual.lancamentos as Array<{ descricao: string }>).map((l) => l.descricao),
    ).not.toContain("Terapia");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-050 a observação do ex-membro não vai para a exportação dos demais", () => {
  type Exp = {
    familiaAtual: {
      lancamentos: Array<{ id: string; descricao: string; observacao: string | null }>;
      previstas: Array<{ id: string; descricao: string; observacao: string | null }>;
    };
  };
  const exportOf = async (who: string): Promise<Exp> => {
    const res = await at(() => call(as(who), "GET", "/api/v1/me/export"));
    expect(res.status).toBe(200);
    return res.body as Exp;
  };

  it("prova do relatório: ao dividir, a descrição sai para Carla e Bia, mas a observação não", async () => {
    const t = await mk(30000, "Farmácia");
    await db.transaction.update({ where: { id: t.id }, data: { note: "remédio controlado" } });
    await removeLucas();
    expect((await patch("Mariana", t.id, 1, { isSharedExpense: true })).status).toBe(200);
    for (const who of ["Carla", "Bia", "Mariana"]) {
      const line = (await exportOf(who)).familiaAtual.lancamentos.find((l) => l.id === t.id);
      expect(line?.descricao, who).toBe("Farmácia");
      expect(line?.observacao, who).toBeNull();
    }
    // o banco guarda a observação (ninguém a apaga); só o arquivo dos demais não a leva
    expect((await txRow(t.id)).note).toBe("remédio controlado");
  });

  it("não afeta o que é de verdade compartilhado: observação de dividida ativa e de quem voltou", async () => {
    const shared = await makeTransaction(fx, {
      account: accCarla,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-10-02",
      payer: "Carla",
      author: "Carla",
      shared: true,
      description: "Mercado",
    });
    await db.transaction.update({ where: { id: shared.id }, data: { note: "feira" } });
    const line = (await exportOf("Bia")).familiaAtual.lancamentos.find((l) => l.id === shared.id);
    expect(line?.observacao).toBe("feira");
  });

  it("previstas divididas de ex-membro também não levam a observação", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
      note: "mensalidade atrasada",
    });
    await removeLucas();
    const ok = await at(() =>
      call(as("Mariana"), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: 1,
        isSharedExpense: true,
      }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = (await exportOf("Carla")).familiaAtual.previstas.find((x) => x.id === p.id);
    expect(row?.descricao).toBe("Escola");
    expect(row?.observacao).toBeNull();
  });
});
