-- US-067 (ADR-042): valores de enum novos. Expand; sozinha porque ALTER TYPE ADD VALUE não roda junto de usos do valor.
ALTER TYPE "FamilyEventType" ADD VALUE 'INVOICE_IMPORTED';
ALTER TYPE "FamilyEventType" ADD VALUE 'INVOICE_IMPORT_REVERTED';
ALTER TYPE "TransactionOrigin" ADD VALUE 'INVOICE_IMPORT';
