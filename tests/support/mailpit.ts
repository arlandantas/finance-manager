const BASE = process.env.MAILPIT_URL ?? "http://localhost:8025";

type Summary = { ID: string; To: Array<{ Address: string }>; Subject: string };

export async function clearMessages() {
  await fetch(`${BASE}/api/v1/messages`, { method: "DELETE" });
}

/** Espera a mensagem para `to` na caixa do Mailpit (UI em 8025) e devolve assunto e texto. */
export async function waitForMessage(
  to: string,
  timeoutMs = 10_000,
): Promise<{ subject: string; text: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/v1/messages`);
    const data = (await res.json()) as { messages: Summary[] };
    const found = data.messages.find((m) =>
      m.To.some((t) => t.Address.toLowerCase() === to.toLowerCase()),
    );
    if (found) {
      const full = (await (await fetch(`${BASE}/api/v1/message/${found.ID}`)).json()) as {
        Text: string;
        Subject: string;
      };
      return { subject: full.Subject, text: full.Text };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Nenhuma mensagem para ${to} no Mailpit`);
}
