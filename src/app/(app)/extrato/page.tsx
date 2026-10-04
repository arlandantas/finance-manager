import { Suspense } from "react";
import { ExtratoScreen } from "./extrato-screen";

export const metadata = { title: "Extrato · Finance Manager" };

export default function ExtratoPage() {
  return (
    <Suspense fallback={null}>
      <ExtratoScreen />
    </Suspense>
  );
}
