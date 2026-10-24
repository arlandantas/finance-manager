import { Suspense } from "react";
import { ResultScreen } from "./result-screen";

export const metadata = { title: "Análise de gastos · Finance Manager" };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ResultScreen id={id} />
    </Suspense>
  );
}
