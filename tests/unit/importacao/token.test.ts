import { describe, expect, it } from "vitest";
import { hashFile, issueImportToken, verifyImportToken } from "@/modules/importacao/token";

const S = "segredo-de-teste";
const NOW = new Date("2026-10-24T15:00:00Z");
const ids = { familyId: "f1", cardId: "c1" };
const input = { ...ids, fileHash: hashFile(new Uint8Array([1, 2])), source: "CSV" as const };
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("US-066 importToken (AC6)", () => {
  const token = issueImportToken(input, NOW, S);
  it("válido devolve o payload com o fileHash", () => {
    expect(verifyImportToken(token, ids, later(1000), S)).toMatchObject({
      fileHash: input.fileHash,
      source: "CSV",
    });
  });
  it("adulterado (corpo ou assinatura) é recusado", () => {
    const [body, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ ...input, fileHash: "x".repeat(64), issuedAt: NOW.getTime() }),
    ).toString("base64url");
    expect(verifyImportToken(`${forged}.${sig}`, ids, NOW, S)).toBeNull();
    expect(verifyImportToken(`${body}.${sig.slice(0, -2)}AA`, ids, NOW, S)).toBeNull();
    expect(verifyImportToken("lixo", ids, NOW, S)).toBeNull();
  });
  it("vencido (> 2 h) é recusado; 2 h exatas ainda vale", () => {
    expect(verifyImportToken(token, ids, later(2 * 3600 * 1000), S)).not.toBeNull();
    expect(verifyImportToken(token, ids, later(2 * 3600 * 1000 + 1), S)).toBeNull();
  });
  it("outra família, outro cartão ou outro segredo é recusado", () => {
    expect(verifyImportToken(token, { ...ids, familyId: "f2" }, NOW, S)).toBeNull();
    expect(verifyImportToken(token, { ...ids, cardId: "c2" }, NOW, S)).toBeNull();
    expect(verifyImportToken(token, ids, NOW, "outro-segredo")).toBeNull();
  });
  it("fileHash = SHA-256 dos bytes", () =>
    expect(hashFile(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    ));
});
