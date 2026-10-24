// EN-004 (ADR-028 §7): a suíte nunca depende de rede nem de chave do provedor.
// Falha de imediato se a configuração apontar para a API real ou se alguém tentar chamá-la.
if (process.env.LLM_PROVIDER === "anthropic") {
  throw new Error("LLM_PROVIDER=anthropic é proibido nos testes (use o provedor simulado)");
}

const realFetch = globalThis.fetch;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (/anthropic\.com/i.test(url)) {
    throw new Error("Chamada de rede ao provedor de LLM bloqueada nos testes");
  }
  return realFetch(input, init);
}) as typeof fetch;
