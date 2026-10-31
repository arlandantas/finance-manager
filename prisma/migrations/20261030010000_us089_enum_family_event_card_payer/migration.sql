-- US-089 (SDD-030 §3.1): evento da conta pagadora do cartão. Migração ISOLADA (valor de enum novo).
ALTER TYPE "FamilyEventType" ADD VALUE 'CARD_PAYER_ACCOUNT_CHANGED';
