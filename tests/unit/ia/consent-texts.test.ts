import { describe, expect, it } from "vitest";
import { AI_CONSENT_TEXTS, consentTextHash } from "@/modules/ia/consent-texts";

// SDD-022 §8: o texto fica AMARRADO à versão. Mudar o texto sem subir a versão falha aqui.
// Ao publicar a versão N+1: acrescente a nova linha ao snapshot (não troque a antiga).
const SNAPSHOT: Record<number, string> = {
  1: "508a2b12d166c4246841beea372be781332f0215824b3d1b87050c69fe77f035",
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
  it("a importação de fatura não tem texto na R4", () => {
    expect(AI_CONSENT_TEXTS.INVOICE_IMPORT).toBeUndefined();
  });
});
