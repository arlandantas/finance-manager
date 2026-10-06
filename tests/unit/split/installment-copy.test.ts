import { describe, expect, it } from "vitest";
import {
  INSTALLMENT_SPLIT_NOTICE,
  parcelasLabel,
  showInstallmentNotice,
} from "@/modules/cartoes/installment-copy";

describe("US-052 aviso do parcelado", () => {
  it("texto exato da história", () => {
    expect(INSTALLMENT_SPLIT_NOTICE).toBe(
      "Compras parceladas ainda não entram na divisão do acerto. Elas contam como Só meu até uma próxima versão.",
    );
  });
  it("só aparece com acerto ligado e flag não liberado (4 combinações)", () => {
    expect(showInstallmentNotice(true, false)).toBe(true);
    expect(showInstallmentNotice(true, true)).toBe(false);
    expect(showInstallmentNotice(false, false)).toBe(false);
    expect(showInstallmentNotice(false, true)).toBe(false);
  });
  it("pluraliza parcelas", () => {
    expect(parcelasLabel(1)).toBe("1 parcela");
    expect(parcelasLabel(3)).toBe("3 parcelas");
  });
});
