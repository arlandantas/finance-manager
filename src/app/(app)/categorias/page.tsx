import { Suspense } from "react";
import { CategoriasScreen } from "./categorias-screen";

export const metadata = { title: "Categorias · Finance Manager" };

export default function CategoriasPage() {
  return (
    <Suspense fallback={null}>
      <CategoriasScreen />
    </Suspense>
  );
}
