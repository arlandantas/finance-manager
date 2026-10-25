// SDD-003 §3.2: mensagens do /login?error=<código>
export function loginErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code === "EmailNotVerified") {
    return "Seu e-mail do Google não está verificado. Verifique-o no Google e tente novamente.";
  }
  if (code === "SignupRestricted") {
    return "O cadastro está restrito a convidados do alpha. Peça acesso a quem convidou você.";
  }
  if (code === "MembershipEnded") return "Seu acesso a esta família foi encerrado";
  return "Não foi possível entrar. Tente novamente.";
}
