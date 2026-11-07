import { describe, expect, it } from "vitest";
import {
  buildTransferSeriesInput,
  buildTransferSeriesPatch,
  seriesImpactText,
} from "@/modules/previstas/transfer-series-form";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const base = {
  fromId: A,
  toId: B,
  cents: 150000,
  description: "",
  day: "5",
  startMonth: "2026-12",
  endKind: "NONE" as const,
  endMonths: "",
};

describe("US-101b: corpo da série de transferência", () => {
  it("monta o corpo em centavos inteiros, sem descrição vazia", () => {
    const r = buildTransferSeriesInput(base);
    expect(r).toEqual({
      ok: true,
      input: {
        fromAccountId: A,
        toAccountId: B,
        amountInCents: 150000,
        dayOfMonth: 5,
        startMonth: "2026-12",
        end: { kind: "NONE" },
      },
    });
  });

  it("COUNT leva o número de meses e descrição só quando preenchida", () => {
    const r = buildTransferSeriesInput({
      ...base,
      description: "Reserva",
      endKind: "COUNT",
      endMonths: "6",
    });
    expect(r.ok && r.input.end).toEqual({ kind: "COUNT", months: 6 });
    expect(r.ok && r.input.description).toBe("Reserva");
  });

  it("erros por campo do formulário: valor, dia, contas iguais, fim", () => {
    const r = buildTransferSeriesInput({
      ...base,
      cents: 0,
      day: "40",
      toId: A,
      endKind: "COUNT",
      endMonths: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["amountInCents", "day", "end", "toAccountId"]);
    }
  });

  it("PATCH leva a versão, descrição nula quando vazia e o fim", () => {
    const r = buildTransferSeriesPatch({ ...base, endKind: "COUNT", endMonths: "3" }, 4);
    expect(r).toEqual({
      ok: true,
      input: {
        version: 4,
        fromAccountId: A,
        toAccountId: B,
        amountInCents: 150000,
        description: null,
        dayOfMonth: 5,
        end: { kind: "COUNT", months: 3 },
      },
    });
  });

  it("texto do impacto", () => {
    expect(
      seriesImpactText({
        affectedCount: 11,
        keptRealizedCount: 1,
        keptExceptionCount: 2,
        endCount: 12,
      }),
    ).toBe("Muda 11; ficam 1 efetivada e 2 alteradas");
    expect(
      seriesImpactText({
        affectedCount: 1,
        keptRealizedCount: 0,
        keptExceptionCount: 0,
        endCount: 1,
      }),
    ).toBe("Muda 1; ficam 0 efetivadas e 0 alteradas");
  });
});
