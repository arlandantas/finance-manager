-- SEC-018 fase 1 (SDD-028 §6.1): o banco passa a guardar só sha256(token). A coluna "sessionToken" fica
-- (anulável, LEGADA) para o código antigo, que ainda serve durante o vercel-build, achar as sessões existentes;
-- a fase 2 (PR separado, >= 1 dia depois) a apaga. Ninguém é desconectado: o mesmo cookie continua valendo.
ALTER TABLE "sessions" ADD COLUMN "tokenHash" TEXT, ADD COLUMN "createdAt" TIMESTAMPTZ(3);
UPDATE "sessions"
   SET "tokenHash" = encode(sha256(convert_to("sessionToken", 'UTF8')), 'hex'),
       "createdAt" = now();
ALTER TABLE "sessions"
  ALTER COLUMN "tokenHash" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT now(),
  ALTER COLUMN "sessionToken" DROP NOT NULL;
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions" ("tokenHash");
