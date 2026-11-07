-- US-096 (ADR-036): origem SUBSCRIPTION. Expand; sozinha porque ALTER TYPE ADD VALUE não roda junto de usos do valor.
-- Reversão: valor de enum não se remove; basta o código deixar de usá-lo (nenhuma linha o referencia sem assinatura).
ALTER TYPE "TransactionOrigin" ADD VALUE 'SUBSCRIPTION';
