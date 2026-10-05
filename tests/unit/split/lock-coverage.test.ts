import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Varredura estática (SDD-015 §4.12, invariante 6; ADR-021 §2): toda função que escreve despesa comum,
 * rateio, regra de divisão ou acerto chama `lockFamilySplit` ANTES de qualquer outra trava. Esquecer a
 * trava reabre a janela de migração × escrita concorrente.
 */
const ROOT = path.resolve(__dirname, "../../..");
const COVERED: Array<[string, string[]]> = [
  ["src/modules/transacoes/service.ts", ["createExpenseCore"]],
  ["src/modules/transacoes/installment-create.ts", ["createInstallmentPurchase"]],
  [
    "src/modules/transacoes/mutations.ts",
    ["updateTransaction", "deleteTransaction", "restoreTransaction"],
  ],
  [
    "src/modules/transacoes/installment-manage.ts",
    ["deleteInstallmentPlan", "restoreInstallmentPlan"],
  ],
  ["src/modules/split/service.ts", ["putSplitRule", "registerSettlement"]],
  ["src/modules/contas/transfers.ts", ["undoTransferGroup"]],
  ["src/modules/previstas/service.ts", ["payPlannedExpense", "undoPlannedPayment"]],
];
// outras travas que NÃO podem vir antes da trava de família
const OTHER_LOCKS = [
  "lockAccountsForPosting(",
  "assertAccountsEditable(",
  "getOrCreateInvoice(",
  "lockInvoices(",
  "lockPlan(",
  "lockPeriod(",
  "FOR UPDATE",
  "FOR SHARE",
  "loadMutable(",
  "loadForPay(",
];

function bodyOf(src: string, fn: string): string {
  const start = src.search(new RegExp(`export async function ${fn}\\(`));
  expect(start, `função ${fn} não encontrada`).toBeGreaterThanOrEqual(0);
  const rest = src.slice(start + 10);
  const next = rest.search(/\nexport (async )?function /);
  return next === -1 ? src.slice(start) : src.slice(start, start + 10 + next);
}

describe("lockFamilySplit: varredura de cobertura (invariante 6)", () => {
  for (const [file, fns] of COVERED) {
    for (const fn of fns) {
      it(`${file} › ${fn} chama lockFamilySplit antes de qualquer outra trava`, () => {
        const body = bodyOf(readFileSync(path.join(ROOT, file), "utf8"), fn);
        const lock = body.indexOf("lockFamilySplit(");
        expect(lock, `${fn} não chama lockFamilySplit`).toBeGreaterThanOrEqual(0);
        for (const other of OTHER_LOCKS) {
          const i = body.indexOf(other);
          if (i !== -1)
            expect(i, `${other} antes da trava de família em ${fn}`).toBeGreaterThan(lock);
        }
      });
    }
  }

  it("só os módulos cobertos escrevem rateio ou chamam o gravador (sem escrita 'esquecida')", () => {
    const covered = new Set(COVERED.map(([f]) => f));
    const allowed = new Set([
      ...covered,
      "src/modules/split/write.ts",
      "src/modules/split/lock.ts",
      "src/modules/split/migrate-family.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) {
          if (name !== "generated") walk(full);
        } else if (/\.tsx?$/.test(name)) {
          const rel = path.relative(ROOT, full).split(path.sep).join("/");
          const src = readFileSync(full, "utf8");
          if (
            /\b(insertSplitRows|rewriteSplitAmounts|clearSplitRows|transactionSplit\.(create|createMany|deleteMany|update))\b/.test(
              src,
            ) &&
            !allowed.has(rel)
          ) {
            offenders.push(rel);
          }
        }
      }
    };
    walk(path.join(ROOT, "src"));
    expect(offenders).toEqual([]);
  });
});
