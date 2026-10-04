// ADR-008 camada (b): falha na subida se o login de teste estiver ativo em produção.
export async function register() {
  const { assertSafeAuthConfig } = await import("@/lib/auth/dev-login-guard");
  assertSafeAuthConfig();
}
