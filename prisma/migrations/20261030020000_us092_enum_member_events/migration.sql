-- US-092 (SDD-033 §3.1): eventos do membro sem conta. Migração ISOLADA (valor de enum novo).
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_CREATED';
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_UPDATED';
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_LINKED';
