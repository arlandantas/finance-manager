"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";

const SHORTCUTS = [
  { label: "Mariana", email: "mariana@exemplo.com", name: "Mariana Silva" },
  { label: "Lucas", email: "lucas@exemplo.com", name: "Lucas Silva" },
];

export function DevLoginForm({ callbackUrl }: { callbackUrl: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function login(payload: { email: string; name?: string }) {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetch("/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(data?.error?.message ?? "Não foi possível entrar. Tente novamente.");
        setBusy(false);
        return;
      }
      window.location.assign(callbackUrl);
    } catch {
      setError("Sem conexão. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="dev-login-title"
      className="mt-6 flex flex-col gap-3 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-4"
    >
      <h2 id="dev-login-title" className="text-sm font-semibold text-amber-900">
        Entrar como (teste)
      </h2>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void login({ email, ...(name.trim() ? { name: name.trim() } : {}) });
        }}
      >
        <Field id="dev-email" label="E-mail de teste" error={error}>
          <TextInput
            id="dev-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            placeholder="pessoa@exemplo.com"
          />
        </Field>
        <Field id="dev-name" label="Nome (opcional)">
          <TextInput id="dev-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || email.trim() === ""}>
          Entrar (teste)
        </Button>
      </form>
      <div className="flex gap-2">
        {SHORTCUTS.map((s) => (
          <Button
            key={s.label}
            variant="secondary"
            className="flex-1"
            disabled={busy}
            onClick={() => void login({ email: s.email, name: s.name })}
          >
            {s.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
