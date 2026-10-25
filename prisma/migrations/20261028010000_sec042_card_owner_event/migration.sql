-- SEC-042 (SDD-028 §11.3 item 5): evento de troca de titular de cartão no histórico da família.
ALTER TYPE "FamilyEventType" ADD VALUE 'CARD_OWNER_CHANGED';
