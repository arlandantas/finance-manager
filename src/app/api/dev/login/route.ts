import { handleDevLogin } from "@/lib/auth/dev-login-handler";

export const dynamic = "force-dynamic";

// ADR-008: provedor de login de teste (fora de /api/v1; sem Idempotency-Key).
export const POST = handleDevLogin;
