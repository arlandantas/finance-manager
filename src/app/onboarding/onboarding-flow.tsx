"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { InviteForm } from "@/components/invite-form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  type CreateFamilyInput,
  type CreateFamilyResponse,
  CreateFamilySchema,
} from "@/modules/familia/schemas";

type Props = {
  userName: string;
  userImage: string | null;
  suggestedName: string;
  notice: string | null;
};

export function OnboardingFlow({ userName, userImage, suggestedName, notice }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreateFamilyResponse | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [settlementEnabled, setSettlementEnabled] = useState(true);
  // ADR-009: a chave nasce com o formulário e é reaproveitada nos reenvios até o sucesso.
  const idempotencyKey = useRef(newIdempotencyKey());
  const submitting = useRef(false);

  const form = useForm<CreateFamilyInput>({
    resolver: zodResolver(CreateFamilySchema),
    defaultValues: { name: suggestedName },
  });

  const create = useMutation({
    mutationFn: (input: CreateFamilyInput) =>
      apiFetch<CreateFamilyResponse>("/api/v1/families", {
        method: "POST",
        body: input,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async (data) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["family"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
      ]);
      setCreated(data);
    },
    onError: (e) => {
      if (e instanceof NetworkError) setBanner(e.message);
      else if (e instanceof ApiClientError && e.code === "ALREADY_IN_FAMILY") {
        setBanner(e.message);
        router.replace("/");
      } else if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR") {
        form.setError("name", { message: e.message });
      } else {
        setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
      }
    },
    onSettled: () => {
      submitting.current = false;
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (submitting.current) return; // duplo clique: a mesma intenção só sai uma vez
    submitting.current = true;
    setBanner(null);
    create.mutate({ ...values, settlementEnabled });
  });

  const firstName = userName.split(" ")[0] ?? userName;

  if (created) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{created.family.name} criada!</h1>
          <p className="text-slate-600">Convide quem divide as contas com você.</p>
          {!settlementEnabled ? (
            <p data-testid="settlement-hint" className="text-sm text-slate-600">
              Você pode mudar isso depois em Configurações da família
            </p>
          ) : null}
        </header>
        <section
          aria-labelledby="invite-step"
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
        >
          <h2 id="invite-step" className="text-base font-semibold text-slate-900">
            Convidar membro
          </h2>
          <InviteForm showRole={false} onDone={() => router.push("/")} />
        </section>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Fazer depois
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28 pt-10 md:pb-10">
      <header className="mb-8 flex items-center gap-3">
        <Avatar name={userName} image={userImage} size={48} />
        <div>
          <p className="text-sm text-slate-500">Bem-vinda(o)</p>
          <p className="text-lg font-semibold text-slate-900">Olá, {firstName}</p>
        </div>
      </header>

      <h1 className="mb-1 text-2xl font-bold text-slate-900">Crie sua família</h1>
      <p className="mb-6 text-slate-600">Só precisamos de um nome para começar.</p>

      {notice ? (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      ) : null}
      {banner ? (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {banner}
        </p>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="flex flex-1 flex-col gap-4">
        <Field id="family-name" label="Nome da família" error={form.formState.errors.name?.message}>
          <TextInput
            id="family-name"
            autoFocus
            autoComplete="off"
            aria-invalid={form.formState.errors.name ? true : undefined}
            aria-describedby={form.formState.errors.name ? "family-name-error" : undefined}
            {...form.register("name")}
          />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-slate-800">
            Como vocês dividem as despesas?
          </legend>
          {[
            { v: true, label: "Quero acertar as diferenças entre os membros" },
            { v: false, label: "Só controlar, sem dividir" },
          ].map((o) => (
            <label
              key={String(o.v)}
              className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
            >
              <input
                type="radio"
                name="settlement"
                checked={settlementEnabled === o.v}
                onChange={() => setSettlementEnabled(o.v)}
              />
              {o.label}
            </label>
          ))}
          <p className="text-xs text-slate-500">
            Você pode mudar isso depois em Configurações da família
          </p>
        </fieldset>
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 md:static md:border-0 md:bg-transparent md:p-0">
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Criando…" : "Criar família"}
          </Button>
        </div>
      </form>
    </main>
  );
}
