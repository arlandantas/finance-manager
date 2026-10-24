"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

// SDD-025 §4.2 + §8.3 (POC só com Claude). Nenhum segredo é exibido: só a URL pública do servidor.
export function ConnectDialog({
  open,
  onOpenChange,
  mcpUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      toast.success("Endereço copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o endereço e copie manualmente.");
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Conectar um assistente">
      <div className="flex flex-col gap-4" data-testid="connect-instructions">
        <p className="text-sm text-slate-800">
          Copie o endereço abaixo e cole no seu assistente. Ele vai abrir o app para você autorizar
          o acesso. Nenhuma senha ou chave precisa ser guardada.
        </p>
        <div className="flex items-center gap-2">
          <code
            data-testid="mcp-url"
            className="min-w-0 flex-1 break-all rounded-lg border border-slate-300 bg-slate-50 p-2 text-sm text-slate-900 dark:bg-slate-200"
          >
            {mcpUrl}
          </code>
          <Button variant="secondary" onClick={copy} aria-label="Copiar endereço">
            {copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            Copiar
          </Button>
        </div>

        <section aria-labelledby="claude-steps" className="flex flex-col gap-2">
          <h3 id="claude-steps" className="font-semibold text-slate-900">
            Claude (web, Desktop e celular)
          </h3>
          <ol className="list-decimal pl-5 text-sm text-slate-800">
            <li>Abra Configurações ▸ Conectores.</li>
            <li>Toque em Adicionar conector personalizado.</li>
            <li>Cole o endereço acima e toque em Conectar.</li>
            <li>Volte para cá e permita o acesso na tela de autorização.</li>
          </ol>
          <p className="text-xs text-slate-600">
            No plano gratuito do Claude cabe 1 conector personalizado.
          </p>
        </section>

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="min-h-6 cursor-pointer text-sm font-semibold text-slate-900">
            Claude Code
          </summary>
          <p className="mt-2 text-sm text-slate-800">No terminal, rode:</p>
          <code className="mt-1 block break-all rounded-lg bg-slate-100 p-2 text-xs text-slate-900">
            claude mcp add --transport http financas {mcpUrl}
          </code>
          <p className="mt-2 text-sm text-slate-800">
            Depois use /mcp para autenticar; o navegador abrirá a tela de autorização.
          </p>
        </details>

        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Fechar
        </Button>
      </div>
    </Drawer>
  );
}
