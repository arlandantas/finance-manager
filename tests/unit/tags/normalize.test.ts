import { describe, expect, it } from "vitest";
import {
  canonicalTagName,
  dedupeTagNames,
  MAX_TAGS_PER_TRANSACTION,
  normalizeTagKey,
} from "@/modules/tags/normalize";
import { TAG_CHARS_MSG, TAG_LEN_MSG, TagNameSchema, TagNamesSchema } from "@/modules/tags/schemas";

const err = (v: unknown) => {
  const r = TagNameSchema.safeParse(v);
  return r.success ? null : r.error.issues[0]?.message;
};

describe("normalizeTagKey / canonicalTagName (SDD-016 §4.1)", () => {
  it("T1: caixa e acento unificam a chave; a grafia gravada é a digitada", () => {
    for (const s of ["Viagem", "viagem", "Viágem", " VIAGEM "]) {
      expect(normalizeTagKey(s)).toBe("viagem");
    }
    expect(canonicalTagName("Viágem")).toBe("Viágem");
    expect(canonicalTagName(" VIAGEM ")).toBe("VIAGEM");
  });

  it("T2: Café / cafe / CAFÉ ⇒ cafe", () => {
    for (const s of ["Café", "cafe", "CAFÉ"]) expect(normalizeTagKey(s)).toBe("cafe");
  });

  it("T3: erro de grafia NÃO é unificado", () => {
    expect(normalizeTagKey("viajem")).not.toBe(normalizeTagKey("viagem"));
  });

  it("T4: espaços internos viram hífen (gravação) e hífens repetidos viram um", () => {
    expect(canonicalTagName("viagem nordeste")).toBe("viagem-nordeste");
    expect(canonicalTagName("Viagem  Nordeste")).toBe("Viagem-Nordeste");
    expect(normalizeTagKey("viagem nordeste")).toBe("viagem-nordeste");
    expect(normalizeTagKey("Viagem  Nordeste")).toBe("viagem-nordeste");
    expect(normalizeTagKey("viagem--nordeste")).toBe("viagem-nordeste");
  });

  it("T7: NFC e NFD dão a mesma chave", () => {
    const nfc = "ação".normalize("NFC");
    const nfd = "ação".normalize("NFD");
    expect(nfc).not.toBe(nfd);
    expect(normalizeTagKey(nfc)).toBe("acao");
    expect(normalizeTagKey(nfd)).toBe("acao");
    expect(canonicalTagName(nfd)).toBe(nfc);
  });

  it("T9: São-Paulo", () => {
    expect(canonicalTagName("São-Paulo")).toBe("São-Paulo");
    expect(normalizeTagKey("São-Paulo")).toBe("sao-paulo");
  });

  it("propriedades: idempotente, sem espaços, só minúsculas sem acento", () => {
    for (const s of ["Viágem Nordeste ", "CAFÉ  da  MANHÃ", "a.b_c-d", "Ação  2026"]) {
      const k = normalizeTagKey(s);
      expect(normalizeTagKey(k)).toBe(k);
      expect(k).not.toMatch(/\s/);
      expect(k).toBe(k.toLocaleLowerCase("pt-BR"));
      expect(k).not.toMatch(/\p{M}/u);
    }
  });

  it("dedupeTagNames: dedup por chave mantém a 1ª grafia", () => {
    expect(dedupeTagNames(["Viagem", "viágem", "Café", "cafe", "ferias"])).toEqual([
      { name: "Viagem", key: "viagem" },
      { name: "Café", key: "cafe" },
      { name: "ferias", key: "ferias" },
    ]);
  });
});

describe("TagNameSchema (SDD-016 §2)", () => {
  it("T5: curta/vazia/só espaços ⇒ mensagem de tamanho", () => {
    for (const v of ["a", "", "   "]) expect(err(v)).toBe(TAG_LEN_MSG);
  });

  it("T6: 31 caracteres ⇒ tamanho; 30 ok (contados por ponto de código)", () => {
    expect(err("a".repeat(31))).toBe(TAG_LEN_MSG);
    expect(err("a".repeat(30))).toBeNull();
    expect(err("ç".repeat(30))).toBeNull();
  });

  it("T8: caracteres fora do conjunto ⇒ mensagem de caracteres", () => {
    for (const v of ["tag,x", "tag!", "#casa", "viagem*", "tag😀"]) {
      expect(err(v)).toBe(TAG_CHARS_MSG);
    }
  });

  it("aceita letras, números, hífen, ponto, sublinhado e espaço interno", () => {
    for (const v of ["viagem-nordeste", "ferias_2026", "a.b", "São Paulo", "Ação"]) {
      expect(err(v)).toBeNull();
    }
  });

  it("aceita NFD (normaliza para NFC antes de validar) e apara as pontas", () => {
    const r = TagNameSchema.parse(` ${"ação".normalize("NFD")} `);
    expect(r).toBe("ação".normalize("NFC"));
  });

  it("lista: até 20, 21 ⇒ erro", () => {
    const ok = Array.from({ length: MAX_TAGS_PER_TRANSACTION }, (_, i) => `tag${i}`);
    expect(TagNamesSchema.safeParse(ok).success).toBe(true);
    expect(TagNamesSchema.safeParse([...ok, "tag-extra"]).success).toBe(false);
  });
});
