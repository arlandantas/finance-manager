// SDD-003 §3.2: mensagens do /login?error=<código>
export function loginErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "EmailNotVerified") {
    return "Seu e-mail do Google não está verificado. Verifique-o no Google e tente novamente.";
  }
  if (code === "MembershipEnded") return "Seu acesso a esta família foi encerrado";
  return "Não foi possível entrar. Tente novamente.";
}
