-- SEC-004 (SDD-028 §1.2): novos valores em migração própria (o Postgres não usa o valor novo na mesma transação).
ALTER TYPE "InvitationStatus" ADD VALUE 'DECLINED';
ALTER TYPE "FamilyEventType" ADD VALUE 'MEMBER_JOINED';
