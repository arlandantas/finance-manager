import { Suspense } from "react";
import { AnaliseScreen } from "./analise-screen";

export const metadata = { title: "Análise · Finance Manager" };

export default function AnalisePage() {
  return (
    <Suspense fallback={null}>
      <AnaliseScreen />
    </Suspense>
  );
}
