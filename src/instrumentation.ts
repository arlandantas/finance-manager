// ADR-008 camada (b): falha na subida se o login de teste estiver ativo em produção.
export async function register() {
  const { assertSafeAuthConfig } = await import("@/lib/auth/dev-login-guard");
  assertSafeAuthConfig();
  // SDD-021 §2: falha fechada na subida (provedor, chave, preço do modelo).
  const { assertLlmConfig } = await import("@/modules/ia/config");
  assertLlmConfig();
  // SEC-010: sem URL exata de cliente CIMD nenhum cliente CIMD é aceito (DCR segue valendo); MCP_CIMD_ALLOWED_HOSTS é ignorada.
  const { cimdAllowedClientIds, mcpEnabled } = await import("@/modules/mcp/config");
  if (mcpEnabled() && cimdAllowedClientIds().length === 0) {
    const { logger } = await import("@/lib/logger");
    logger.warn(
      { event: "mcp_cimd_allowlist_empty" },
      "MCP_CIMD_ALLOWED_CLIENT_IDS vazia: nenhum cliente CIMD será aceito",
    );
  }
}
