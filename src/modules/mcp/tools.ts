import type { AnyTool } from "@/modules/mcp/run-tool";

/**
 * Registro de ferramentas do servidor. EN-006b entrega só a base (escopo, auditoria, taxa): as sete
 * ferramentas de leitura são a US-075 (SDD-026) e o lançamento direto a US-076a (SDD-027).
 * `tools/list` vazio é o comportamento esperado até lá.
 */
export const mcpTools: AnyTool[] = [];
