"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Aviso de boas-vindas (`?joined=1`, SDD-003 §5.5): lê o parâmetro uma vez, guarda o aviso em
 * estado (continua visível) e limpa a URL com `router.replace`.
 */
export function JoinedNotice({ familyName }: { familyName: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [show, setShow] = useState(false);
  const joined = params.get("joined") === "1";
  useEffect(() => {
    if (!joined) return;
    setShow(true);
    router.replace(pathname);
  }, [joined, pathname, router]);
  if (!show) return null;
  return (
    <p
      role="status"
      className="mb-4 rounded-xl border border-brand-100 bg-brand-50 p-4 font-medium text-brand-800"
    >
      Você entrou na {familyName}
    </p>
  );
}
