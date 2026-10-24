-- US-065 (SDD-020 §5, ADR-027): parcelas pagas antes do app = contador no plano, sem linhas.
ALTER TABLE "installment_plans" ADD COLUMN "paidBeforeAppCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_paid_before_chk
  CHECK ("paidBeforeAppCount" >= 0 AND "paidBeforeAppCount" < "installmentCount");

CREATE OR REPLACE FUNCTION installment_plan_paid_before_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."paidBeforeAppCount" <> OLD."paidBeforeAppCount" THEN
    RAISE EXCEPTION 'paidBeforeAppCount is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER installment_plans_paid_before_immutable BEFORE UPDATE ON "installment_plans"
  FOR EACH ROW EXECUTE FUNCTION installment_plan_paid_before_immutable();
