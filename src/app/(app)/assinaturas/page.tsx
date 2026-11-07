import { Suspense } from "react";
import { SubscriptionsScreen } from "./subscriptions-screen";

export const metadata = { title: "Assinaturas · Finance Manager" };

export default function AssinaturasPage() {
  return (
    <Suspense fallback={null}>
      <SubscriptionsScreen />
    </Suspense>
  );
}
