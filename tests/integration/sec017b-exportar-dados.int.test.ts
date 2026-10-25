import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { ExportSchema } from "@/modules/privacidade/export-schema";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";
import { oauthDance, stubCimd, useMcpEnv } from "../support/mcp-client";

// SEC-017b (SDD-028 §7.3, US-079): exportar os dados do titular.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const exp = (who: ReturnType<typeof lucas> | null) =>
  at(() => call(who, "GET", "/api/v1/me/export"));

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily({ name: "Família Silva" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SEC-017b exportar meus dados", () => {
  it("baixa o JSON com o nome do arquivo pela data e o formato validado pelo schema estrito", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 0,
    });
    await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 15050,
      occurredOn: "2026-10-10",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    const r = await exp(lucas());
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(r.headers.get("content-disposition")).toBe(
      'attachment; filename="meus-dados-2026-11-05.json"',
    );
    expect(r.headers.get("cache-control")).toBe("no-store");
    const file = ExportSchema.parse(r.body); // .strict(): qualquer campo a mais falha
    expect(file.version).toBe(1);
    expect(file.perfil).toMatchObject({ nome: "Lucas Silva", email: "lucas@exemplo.com" });
    expect(file.vinculos).toHaveLength(1);
    expect(file.familiaAtual?.nome).toBe("Família Silva");
    expect(file.familiaAtual?.contas.map((c) => c.nome)).toContain("Itaú Lucas");
    const l = file.familiaAtual?.lancamentos.find(
      (t) => t.descricao.length > 0 && t.valorEmCentavos === 15050,
    );
    expect(l).toBeDefined(); // 15050 centavos, não "150,50"
    expect(Number.isInteger(l?.valorEmCentavos)).toBe(true);
    // snapshot do formato: chaves de primeiro nível e de um lançamento
    expect(Object.keys(r.body).sort()).toEqual([
      "conexoesAssistente",
      "consentimentos",
      "familiaAtual",
      "familiasAnteriores",
      "geradoEm",
      "perfil",
      "version",
      "vinculos",
    ]);
    // lançamento sem divisão gravada: não traz o campo "divisao"
    expect(Object.keys(l as object).sort()).toEqual(
      [
        "acertoId",
        "autorId",
        "cartaoId",
        "categoriaId",
        "competencia",
        "contaId",
        "criadoEm",
        "data",
        "descricao",
        "direcao",
        "dividida",
        "excluidoEm",
        "faturaId",
        "id",
        "modoDivisao",
        "observacao",
        "origem",
        "pagadorId",
        "parcela",
        "parcelas",
        "planoParcelasId",
        "tipo",
        "valorEmCentavos",
      ].sort(),
    );
  });

  it('"Só meu" de outra pessoa não sai no arquivo (despesa, prevista); o próprio e o dividido saem', async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 1000,
    });
    const mk = (author: "Mariana" | "Lucas", cents: number, shared: boolean, description: string) =>
      makeTransaction(fx, {
        account: nub,
        category: "Supermercado",
        amountInCents: cents,
        occurredOn: "2026-10-03",
        author,
        payer: author,
        shared,
        description,
      });
    await mk("Mariana", 1111, false, "Só meu da Mariana");
    await mk("Mariana", 2222, true, "Dividido da Mariana");
    await mk("Lucas", 3333, false, "Só meu do Lucas");
    await makePlannedExpense(fx, {
      description: "Previsto da Mariana",
      amountInCents: 500,
      dueOn: "2026-11-10",
      responsible: "Mariana",
      shared: false,
    });
    await makePlannedExpense(fx, {
      description: "Previsto do Lucas",
      amountInCents: 600,
      dueOn: "2026-11-11",
      responsible: "Lucas",
      shared: false,
    });
    const l = (await exp(lucas())).body.familiaAtual;
    const descr = l.lancamentos.map((t: { descricao: string }) => t.descricao);
    expect(descr).toContain("Dividido da Mariana");
    expect(descr).toContain("Só meu do Lucas");
    expect(descr).not.toContain("Só meu da Mariana");
    expect(l.previstas.map((p: { descricao: string }) => p.descricao)).toEqual([
      "Previsto do Lucas",
    ]);
    const m = (await exp(mariana())).body.familiaAtual;
    expect(m.lancamentos.map((t: { descricao: string }) => t.descricao)).toContain(
      "Só meu da Mariana",
    );
    expect(m.lancamentos.map((t: { descricao: string }) => t.descricao)).not.toContain(
      "Só meu do Lucas",
    );
  });

  it("sem sessão: 401", async () => {
    expect((await exp(null)).status).toBe(401);
  });

  it("conexões de assistente aparecem sem chaves nem tokens", async () => {
    const tokens = await oauthDance({ member: lucas(), label: "Meu Claude" });
    const r = await exp(lucas());
    expect(r.body.conexoesAssistente).toHaveLength(1);
    expect(r.body.conexoesAssistente[0]).toMatchObject({
      situacao: "ACTIVE",
      familiaId: fx.family.id,
    });
    const text = JSON.stringify(r.body);
    for (const secret of [tokens.accessToken, tokens.refreshToken, tokens.code]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toMatch(/tokenHash|sessionToken|access_token|refresh_token|id_token/);
    // nem credenciais de sessão do próprio titular
    expect(text).not.toContain(lucas().cookie.split("=")[1] as string);
  });

  it("consentimentos de IA do titular aparecem com data e versão", async () => {
    await db.aiConsentEvent.create({
      data: {
        familyId: fx.family.id,
        purpose: "SPENDING_ANALYSIS",
        action: "ENABLED",
        textVersion: 1,
        memberId: fx.byName.Mariana?.memberId as string,
      },
    });
    const m = await exp(mariana());
    expect(m.body.consentimentos).toMatchObject([
      { finalidade: "SPENDING_ANALYSIS", acao: "ENABLED", versaoDoTexto: 1 },
    ]);
    expect((await exp(lucas())).body.consentimentos).toEqual([]);
  });

  it("ex-membro leva só perfil, vínculos e os lançamentos que fez ou pagou; nada de contas, cartões ou de Mariana", async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 7700,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Mariana",
      shared: true,
    });
    await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 1100,
      occurredOn: "2026-10-04",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 2200,
      occurredOn: "2026-10-05",
      author: "Mariana",
      payer: "Lucas",
      shared: true,
    });
    await db.member.update({
      where: { id: fx.byName.Lucas?.memberId as string },
      data: { removedAt: new Date("2026-10-20T10:00:00Z"), removalKind: "REMOVED" },
    });
    const relogin = await asUser("lucas@exemplo.com");
    const r = await exp(relogin);
    expect(r.status).toBe(200);
    const file = ExportSchema.parse(r.body);
    expect(file.familiaAtual).toBeNull();
    expect(file.vinculos[0]).toMatchObject({ familia: "Família Silva", motivoSaida: "REMOVED" });
    const former = file.familiasAnteriores[0];
    expect(former?.lancamentos.map((t) => t.valorEmCentavos).sort()).toEqual([1100, 2200]);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("Nubank");
    expect(text).not.toContain("mariana@exemplo.com");
    expect(former?.membros.map((m) => m.nome).sort()).toEqual(["Lucas Silva", "Mariana Silva"]);
    expect(Object.keys(former?.membros[0] ?? {}).sort()).toEqual(["id", "nome"]);
  });

  it("não vaza dados de outra família", async () => {
    const other = await makeFamily({
      name: "Família Souza",
      members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
    });
    const conta = await makeAccount(other, {
      name: "Conta da Ana",
      owner: "Ana",
      openingBalanceInCents: 99900,
    });
    await makeTransaction(other, {
      account: conta,
      category: "Supermercado",
      amountInCents: 4242,
      occurredOn: "2026-10-03",
      author: "Ana",
      payer: "Ana",
      shared: false,
    });
    const text = JSON.stringify((await exp(lucas())).body);
    for (const leak of [
      "Família Souza",
      "Conta da Ana",
      "ana@exemplo.com",
      "Ana Souza",
      other.family.id,
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("limite de 3 downloads por dia; o 4º recebe 429 com a mensagem; outra pessoa não é afetada", async () => {
    for (let i = 0; i < 3; i++) expect((await exp(lucas())).status).toBe(200);
    const r = await exp(lucas());
    expect(r.status).toBe(429);
    expect(r.body.error).toMatchObject({
      code: "EXPORT_LIMIT",
      message: "Você já baixou seus dados 3 vezes hoje. Tente de novo amanhã.",
    });
    expect((await exp(mariana())).status).toBe(200);
  });

  it("acima do teto de bytes: 413 e orientação para o suporte", async () => {
    vi.stubEnv("PRIVACY_EXPORT_MAX_BYTES", "200");
    const r = await exp(lucas());
    expect(r.status).toBe(413);
    expect(r.body.error).toMatchObject({
      code: "EXPORT_TOO_LARGE",
      message: "Seus dados são grandes demais para baixar aqui. Fale com o suporte.",
    });
  });

  it("é somente leitura: nada muda no banco", async () => {
    const before = await db.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT (SELECT count(*) FROM members) + (SELECT count(*) FROM transactions) + (SELECT count(*) FROM family_events) AS n`;
    await exp(lucas());
    const after = await db.$queryRaw<
      Array<{ n: bigint }>
    >`SELECT (SELECT count(*) FROM members) + (SELECT count(*) FROM transactions) + (SELECT count(*) FROM family_events) AS n`;
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});
