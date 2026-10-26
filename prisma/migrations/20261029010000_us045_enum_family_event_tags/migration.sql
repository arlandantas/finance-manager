-- US-045/US-046 (SDD-016 §5, ADR-022): eventos de gestão de tags na trilha da família.
-- Migração ISOLADA: um valor novo de enum não pode ser usado na mesma transação em que nasce.
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_RENAMED';
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_MERGED';
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_DELETED';
