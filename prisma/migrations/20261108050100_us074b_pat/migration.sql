-- US-074b (ADR-043): chave do Administrador para o token pessoal; nasce desligada (expand, sem backfill).
ALTER TABLE "families" ADD COLUMN "assistantPatEnabled" BOOLEAN NOT NULL DEFAULT false;
