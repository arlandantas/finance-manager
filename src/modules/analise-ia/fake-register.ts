import { spendingAnalysisFixtures } from "@/modules/analise-ia/fake-fixtures";
import { getFakeAdapter } from "@/modules/ia/provider";

/** Registra (uma vez) as respostas simuladas da análise no provedor fake; no-op com o provedor real. */
export function fixturesForFake(): void {
  const fake = getFakeAdapter();
  if (fake && !fake.fixtures.SPENDING_ANALYSIS) {
    fake.fixtures = { ...fake.fixtures, SPENDING_ANALYSIS: spendingAnalysisFixtures };
  }
}
