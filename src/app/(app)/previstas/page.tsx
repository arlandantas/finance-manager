import { Suspense } from "react";
import { PrevistasScreen } from "./previstas-screen";

export const metadata = { title: "Previstas · Finance Manager" };

export default function PrevistasPage() {
  return (
    <Suspense fallback={null}>
      <PrevistasScreen />
    </Suspense>
  );
}
