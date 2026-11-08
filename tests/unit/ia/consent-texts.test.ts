import { describe, expect, it } from "vitest";
import { AI_CONSENT_TEXTS, consentTextHash } from "@/modules/ia/consent-texts";

// SDD-022 §8: o texto fica AMARRADO à versão. Mudar o texto sem subir a versão falha aqui.
// Ao publicar a versão N+1: acrescente a nova linha ao snapshot (não troque a antiga).
const SNAPSHOT: Record<number, string> = {
  1: "508a2b12d166c4246841beea372be781332f0215824b3d1b87050c69fe77f035",
};
// US-066c: texto próprio da importação de fatura (ADR-042 §4), também amarrado à versão.
const SNAPSHOT_INVOICE: Record<number, string> = {
  1: "d041a0614bdb4f83945652f6f733036d74406197dd05c20c0d990ad248109fe9",
};

describe("EN-005 textos de consentimento versionados", () => {
  const t = AI_CONSENT_TEXTS.SPENDING_ANALYSIS;
  it("a versão vigente tem hash conhecido (mudou o texto ⇒ suba a versão)", () => {
    expect(t).toBeDefined();
    if (!t) return;
    expect(SNAPSHOT[t.version]).toBe(consentTextHash(t));
  });
  it("o texto nomeia o provedor, diz que fica fora do Brasil e não promete retenção zero", () => {
    const all = `${t?.summary} ${t?.details.join(" ")}`;
    expect(all).toMatch(/Anthropic/);
    expect(all).toMatch(/fora do Brasil/);
    expect(all).not.toMatch(/reten[cç][aã]o zero|n[aã]o (é|e) usado para treino|descartad/i);
    expect(all).not.toMatch(/fatura/i); // importação de fatura é R5 (D-GES-28)
  });
  it("INVOICE_IMPORT v1: hash conhecido, declara que a descrição do estabelecimento sai, sem retenção zero", () => {
    const inv = AI_CONSENT_TEXTS.INVOICE_IMPORT;
    expect(inv).toBeDefined();
    if (!inv) return;
    expect(SNAPSHOT_INVOICE[inv.version]).toBe(consentTextHash(inv));
    const all = `${inv.summary} ${inv.details.join(" ")}`;
    expect(all).toMatch(/Anthropic/);
    expect(all).toMatch(/descrição do estabelecimento/);
    expect(all).toMatch(/Estados Unidos/);
    expect(all).toMatch(/não é guardado/);
    expect(all).not.toMatch(
      /reten[cç][aã]o zero|n[aã]o (é|e) usado para treino|descartad[oa] pelo/i,
    );
  });
});
