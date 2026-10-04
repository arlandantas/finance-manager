import { Suspense } from "react";
import { AcertoScreen } from "./acerto-screen";

export const metadata = { title: "Acerto de contas · Finance Manager" };

export default function AcertoPage() {
  return (
    <Suspense fallback={null}>
      <AcertoScreen />
    </Suspense>
  );
}
