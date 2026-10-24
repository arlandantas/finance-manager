import { Suspense } from "react";
import { AnaliseScreen } from "./analise-screen";

export const metadata = { title: "Gastos evitáveis · Finance Manager" };

export default function GastosEvitaveisPage() {
  return (
    <Suspense fallback={null}>
      <AnaliseScreen />
    </Suspense>
  );
}
