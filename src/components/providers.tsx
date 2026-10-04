"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Toaster } from "sonner";
import { ApiClientError } from "@/lib/http";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // 4xx (ex.: 404 de outra família) não melhora ao repetir; falhas de rede: 2 novas tentativas curtas.
            retry: (failureCount, error) =>
              failureCount < 2 &&
              !(error instanceof ApiClientError && error.status >= 400 && error.status < 500),
            retryDelay: 400,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}
