import { withApi } from "@/lib/api/with-api";
import { setFamilyAssistantAccess } from "@/modules/mcp/connections";
import { SetAssistantAccessSchema } from "@/modules/mcp/connections-schemas";

export const dynamic = "force-dynamic";

// SDD-025 §3: chave "Permitir acesso por assistente" (só ADMIN; a mensagem de 403 fica no serviço).
export const PATCH = withApi({ body: SetAssistantAccessSchema }, async ({ ctx, tx, body }) => ({
  status: 200,
  body: await setFamilyAssistantAccess(tx, ctx, body),
}));
