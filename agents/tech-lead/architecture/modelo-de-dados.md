# Modelo de Dados Consolidado (R1)

*Responsável: Agente Tech Lead · 2026-10-04 · Referências: [ADR-007](../adrs/ADR-007-modelo-de-ledger-e-correcoes.md), [ADR-009](../adrs/ADR-009-idempotencia-e-controle-otimista.md), [ADR-010](../adrs/ADR-010-periodo-e-datas.md), [ADR-011](../adrs/ADR-011-regra-de-divisao-versionada.md), [ADR-012](../adrs/ADR-012-convites-e-email.md), [ADR-013](../adrs/ADR-013-isolamento-por-familia.md).*
*Substitui o diagrama de classes preliminar de `overview.md`. Cobre EN-001 e US-001..013 (§1–§6). **A R2 (US-014..019: categorias, cartões, fatura, previstas) é o §7 deste documento**; orçamento e demais AP1+ ainda não entram.*

## 1. Diagrama ER

```mermaid
erDiagram
    User ||--o{ Account : "provedores OAuth (Auth.js)"
    User ||--o{ Session : "sessões"
    User ||--o| Member : "1 família no R1"
    Family ||--o{ Member : ""
    Family ||--o{ Invitation : ""
    Family ||--o{ BankAccount : ""
    Family ||--o{ Category : ""
    Family ||--o{ Transaction : ""
    Family ||--o{ TransferGroup : ""
    Family ||--o{ SplitRuleVersion : ""
    Member ||--o{ BankAccount : "titular (owner)"
    Member ||--o{ Transaction : "autor / pagador"
    BankAccount ||--o{ Transaction : "movimenta"
    Category ||--o{ Transaction : "classifica"
    TransferGroup ||--o{ Transaction : "2 pernas (OUT/IN)"
    Transaction ||--o{ TransactionRevision : "auditoria append-only"
    SplitRuleVersion ||--o{ SplitShare : "bps por membro"
    Member ||--o{ SplitShare : ""
    User ||--o{ IdempotencyRecord : ""

    Family { uuid id PK
      string name
      string timezone "America/Sao_Paulo"
      int cutDay "1..28, padrão 1" }
    Member { uuid id PK
      uuid familyId FK
      uuid userId FK "UNIQUE no R1"
      enum role "ADMIN|MEMBER"
      timestamptz joinedAt }
    Invitation { uuid id PK
      string email "minúsculo"
      string tokenHash
      enum status
      timestamptz expiresAt }
    BankAccount { uuid id PK
      string name "único por família (case-insens.)"
      enum type
      uuid ownerMemberId FK
      int version }
    Transaction { uuid id PK
      enum kind
      enum direction
      bigint amountInCents
      date occurredOn
      uuid payerMemberId FK
      uuid authorMemberId FK
      bool isSharedExpense
      uuid transferGroupId FK
      int version
      timestamptz deletedAt }
    TransferGroup { uuid id PK
      enum kind "TRANSFER|SETTLEMENT"
      string settlementPeriod
      uuid settlementFromMemberId
      uuid settlementToMemberId
      int version }
    SplitRuleVersion { uuid id PK
      enum kind "EQUAL|PROPORTIONAL"
      date effectiveFrom }
    SplitShare { uuid id PK
      int bps "0..10000" }
```

## 2. Convenções
- IDs `uuid` (`@default(uuid()) @db.Uuid`). Tabelas em `snake_case` via `@@map`; campos em `camelCase` no Prisma.
- Datas contábeis `@db.Date`; eventos `@db.Timestamptz(3)`.
- Dinheiro `BigInt` (centavos), convertido com `toCents()` na borda (SDD-000 §3).
- Os modelos do Auth.js mantêm os nomes que o adaptador Prisma espera (`User`, `Account`, `Session`, `VerificationToken`). Para evitar colisão, a **conta bancária chama-se `BankAccount`** (tabela `bank_accounts`); nos contratos de API o campo continua `accountId`.
- Todas as tabelas de domínio têm `familyId` e **`@@unique([familyId, id])`** para permitir FKs compostas (ADR-013).

## 3. Schema Prisma proposto (trechos normativos)

> O Dev gera a migração a partir disto, ajustando sintaxe à versão instalada. **Normativo:** nomes de campos/enums, tipos, `@unique`/índices, FKs compostas e os `CHECK`/índices parciais da §4. O `SystemInfo` do EN-001 permanece.

```prisma
generator client { provider = "prisma-client"; output = "../src/generated/prisma" }
datasource db { provider = "postgresql" }

enum Role              { ADMIN MEMBER }
enum InvitationStatus  { PENDING ACCEPTED CANCELED EXPIRED }
enum BankAccountType   { CHECKING SAVINGS CASH }
enum CategoryKind      { EXPENSE INCOME }
enum TransactionKind   { EXPENSE INCOME OPENING TRANSFER_OUT TRANSFER_IN }
enum Direction         { CREDIT DEBIT }
enum DeletionReason    { DELETED UNDONE }
enum TransferGroupKind { TRANSFER SETTLEMENT }
enum SplitKind         { EQUAL PROPORTIONAL }
enum RevisionAction    { CREATE UPDATE DELETE RESTORE UNDO }
enum EmailStatus       { SENT FAILED }

// ───────── Auth.js (adaptador Prisma) ─────────
model User {
  id            String    @id @default(uuid()) @db.Uuid
  name          String?
  email         String    @unique            // SEMPRE minúsculo (normalizado no adaptador)
  emailVerified DateTime? @db.Timestamptz(3)
  image         String?
  createdAt     DateTime  @default(now()) @db.Timestamptz(3)
  accounts      Account[]
  sessions      Session[]
  member        Member?
  idempotency   IdempotencyRecord[]
  @@map("users")
}
model Account {                               // modelo do Auth.js (NÃO é a conta bancária)
  id                String  @id @default(uuid()) @db.Uuid
  userId            String  @db.Uuid
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@map("accounts")
}
model Session {
  id           String   @id @default(uuid()) @db.Uuid
  sessionToken String   @unique
  userId       String   @db.Uuid
  expires      DateTime @db.Timestamptz(3)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@map("sessions")
}
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime @db.Timestamptz(3)
  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ───────── Núcleo familiar ─────────
model Family {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  timezone  String   @default("America/Sao_Paulo")
  currency  String   @default("BRL")
  cutDay    Int      @default(1)                // CHECK 1..28; sem UI no R1 (ADR-010)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  members      Member[]
  invitations  Invitation[]
  bankAccounts BankAccount[]
  categories   Category[]
  transactions Transaction[]
  transferGroups TransferGroup[]
  splitRules   SplitRuleVersion[]
  @@map("families")
}
model Member {
  id       String   @id @default(uuid()) @db.Uuid
  familyId String   @db.Uuid
  userId   String   @db.Uuid
  role     Role
  joinedAt DateTime @default(now()) @db.Timestamptz(3)
  family Family @relation(fields: [familyId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
  @@unique([userId])                            // R1: 1 família por usuário (relaxar por migração se N famílias)
  @@unique([familyId, userId])
  @@unique([familyId, id])
  @@map("members")
}
model Invitation {
  id               String           @id @default(uuid()) @db.Uuid
  familyId         String           @db.Uuid
  email            String                              // minúsculo
  role             Role             @default(MEMBER)
  tokenHash        String           @unique            // sha256(token) em hex
  status           InvitationStatus @default(PENDING)
  expiresAt        DateTime         @db.Timestamptz(3)
  invitedByMemberId String          @db.Uuid
  emailStatus      EmailStatus
  createdAt        DateTime         @default(now()) @db.Timestamptz(3)
  acceptedAt       DateTime?        @db.Timestamptz(3)
  acceptedByUserId String?          @db.Uuid
  canceledAt       DateTime?        @db.Timestamptz(3)
  family Family @relation(fields: [familyId], references: [id])
  @@index([familyId, status])
  @@index([email, status])
  @@map("invitations")                        // + índice único parcial (familyId, email) WHERE status='PENDING' (§4)
}

// ───────── Contas, categorias, movimentações ─────────
model BankAccount {
  id            String          @id @default(uuid()) @db.Uuid
  familyId      String          @db.Uuid
  name          String                               // trim; único por família ignorando caixa (§4)
  institution   String
  type          BankAccountType
  ownerMemberId String          @db.Uuid
  version       Int             @default(1)
  createdAt     DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime        @updatedAt @db.Timestamptz(3)
  family       Family @relation(fields: [familyId], references: [id])
  owner        Member @relation(fields: [familyId, ownerMemberId], references: [familyId, id])
  transactions Transaction[]
  @@unique([familyId, id])
  @@map("bank_accounts")
}
model Category {
  id        String       @id @default(uuid()) @db.Uuid
  familyId  String       @db.Uuid
  name      String
  kind      CategoryKind
  icon      String                                   // chave de ícone (ex.: "shopping-cart") ou emoji
  sortOrder Int
  archivedAt DateTime?   @db.Timestamptz(3)          // uso futuro (US-014)
  family Family @relation(fields: [familyId], references: [id])
  transactions Transaction[]
  @@unique([familyId, kind, name])
  @@unique([familyId, id])
  @@map("categories")
}
model TransferGroup {
  id                     String            @id @default(uuid()) @db.Uuid
  familyId               String            @db.Uuid
  kind                   TransferGroupKind
  occurredOn             DateTime          @db.Date
  settlementPeriod       String?                       // "YYYY-MM" (kind=SETTLEMENT)
  settlementFromMemberId String?           @db.Uuid    // devedor
  settlementToMemberId   String?           @db.Uuid    // credor
  authorMemberId         String            @db.Uuid
  version                Int               @default(1)
  createdAt              DateTime          @default(now()) @db.Timestamptz(3)
  deletedAt              DateTime?         @db.Timestamptz(3)   // desfeito
  deletedByMemberId      String?           @db.Uuid
  family Family @relation(fields: [familyId], references: [id])
  legs   Transaction[]
  @@unique([familyId, id])
  @@index([familyId, kind, settlementPeriod])
  @@map("transfer_groups")
}
model Transaction {
  id                String          @id @default(uuid()) @db.Uuid
  familyId          String          @db.Uuid
  kind              TransactionKind
  direction         Direction
  accountId         String          @db.Uuid
  amountInCents     BigInt                              // magnitude (>0; OPENING pode ser 0)
  occurredOn        DateTime        @db.Date
  categoryId        String?         @db.Uuid            // EXPENSE/INCOME: obrigatório; demais: nulo
  description       String                              // 2..100; padrão = nome da categoria; transferências: texto gerado
  note              String?                             // até 500
  payerMemberId     String?         @db.Uuid            // EXPENSE/INCOME: quem pagou/recebeu (D-PO-01); demais: nulo
  isSharedExpense   Boolean         @default(false)     // true só em EXPENSE comum
  authorMemberId    String          @db.Uuid            // imutável
  updatedByMemberId String?         @db.Uuid
  transferGroupId   String?         @db.Uuid
  version           Int             @default(1)
  createdAt         DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime        @updatedAt @db.Timestamptz(3)
  deletedAt         DateTime?       @db.Timestamptz(3)
  deletedByMemberId String?         @db.Uuid
  deletionReason    DeletionReason?

  family   Family        @relation(fields: [familyId], references: [id])
  account  BankAccount   @relation(fields: [familyId, accountId], references: [familyId, id])
  category Category?     @relation(fields: [familyId, categoryId], references: [familyId, id])
  payer    Member?       @relation("TxPayer",  fields: [familyId, payerMemberId], references: [familyId, id])
  author   Member        @relation("TxAuthor", fields: [familyId, authorMemberId], references: [familyId, id])
  group    TransferGroup? @relation(fields: [familyId, transferGroupId], references: [familyId, id])
  revisions TransactionRevision[]

  @@unique([familyId, id])
  @@index([familyId, occurredOn(sort: Desc), createdAt(sort: Desc), id(sort: Desc)])
  @@index([familyId, accountId])
  @@index([familyId, payerMemberId, occurredOn])
  @@index([familyId, kind, occurredOn])
  @@map("transactions")                        // + CHECKs e índice único parcial (§4)
}
model TransactionRevision {                    // append-only (trigger, §4)
  id            String         @id @default(uuid()) @db.Uuid
  familyId      String         @db.Uuid
  transactionId String         @db.Uuid
  revision      Int                              // = version resultante
  action        RevisionAction
  actorMemberId String         @db.Uuid
  at            DateTime       @default(now()) @db.Timestamptz(3)
  changes       Json                             // [{ field, from, to }]; CREATE: snapshot em "to"
  transaction Transaction @relation(fields: [transactionId], references: [id])
  @@unique([transactionId, revision, action])
  @@index([familyId, transactionId, at])
  @@map("transaction_revisions")
}

// ───────── Divisão (SDD-002) ─────────
model SplitRuleVersion {
  id              String    @id @default(uuid()) @db.Uuid
  familyId        String    @db.Uuid
  kind            SplitKind
  effectiveFrom   DateTime  @db.Date
  createdByMemberId String? @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz(3)
  family Family @relation(fields: [familyId], references: [id])
  shares SplitShare[]
  @@index([familyId, effectiveFrom(sort: Desc), createdAt(sort: Desc)])
  @@map("split_rule_versions")
}
model SplitShare {
  id       String @id @default(uuid()) @db.Uuid
  ruleId   String @db.Uuid
  memberId String @db.Uuid
  bps      Int                                  // 0..10000
  rule SplitRuleVersion @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  @@unique([ruleId, memberId])
  @@map("split_shares")
}

// ───────── Infra ─────────
model IdempotencyRecord {
  id             String   @id @default(uuid()) @db.Uuid
  userId         String   @db.Uuid
  key            String
  method         String
  path           String
  requestHash    String
  responseStatus Int
  responseBody   Json
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, key])
  @@index([createdAt])
  @@map("idempotency_records")
}
```

## 4. Migração em SQL cru (CHECKs, índices parciais, triggers) — obrigatória

```sql
-- Família
ALTER TABLE families ADD CONSTRAINT families_cut_day_chk CHECK ("cutDay" BETWEEN 1 AND 28);

-- Conta: nome único por família, sem distinguir caixa/espaços nas pontas
CREATE UNIQUE INDEX bank_accounts_family_name_uq ON bank_accounts ("familyId", lower(btrim(name)));

-- Convite: no máximo um PENDENTE por (família, e-mail)
CREATE UNIQUE INDEX invitations_pending_uq ON invitations ("familyId", email) WHERE status = 'PENDING';

-- Transação: invariantes do ledger (ADR-007)
ALTER TABLE transactions ADD CONSTRAINT tx_amount_chk CHECK (
  ("amountInCents" > 0) OR (kind = 'OPENING' AND "amountInCents" >= 0));
ALTER TABLE transactions ADD CONSTRAINT tx_kind_shape_chk CHECK (
  (kind = 'EXPENSE'      AND direction = 'DEBIT'  AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "transferGroupId" IS NULL)
  OR (kind = 'INCOME'    AND direction = 'CREDIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "isSharedExpense" = false AND "transferGroupId" IS NULL)
  OR (kind = 'OPENING'   AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NULL)
  OR (kind = 'TRANSFER_OUT' AND direction = 'DEBIT'  AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NOT NULL)
  OR (kind = 'TRANSFER_IN'  AND direction = 'CREDIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NOT NULL));
ALTER TABLE transactions ADD CONSTRAINT tx_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL AND "deletionReason" IS NULL)
  OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL AND "deletionReason" IS NOT NULL));
-- Exatamente uma perna de cada tipo por transferência
CREATE UNIQUE INDEX tx_transfer_leg_uq ON transactions ("transferGroupId", kind) WHERE "transferGroupId" IS NOT NULL;

-- Auditoria append-only
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER transaction_revisions_append_only
  BEFORE UPDATE OR DELETE ON transaction_revisions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
-- Hard delete de movimentação proibido
CREATE TRIGGER transactions_no_delete BEFORE DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Divisão
ALTER TABLE split_shares ADD CONSTRAINT split_bps_chk CHECK (bps BETWEEN 0 AND 10000);
```
Observação: a soma de `bps` = 10000 por versão é validada no serviço (SDD-002) e verificada por teste de integração; não por `CHECK` (soma entre linhas).

## 5. Consultas-chave (referência de índice/SQL)
- **Saldo por conta:** `SELECT "accountId", SUM(CASE direction WHEN 'CREDIT' THEN "amountInCents" ELSE -"amountInCents" END) FROM transactions WHERE "familyId" = $1 AND "deletedAt" IS NULL GROUP BY "accountId"` (usar `$queryRaw`, converter `numeric` → `number` com asserção).
- **Totais receita/despesa do filtro:** idem, restrito a `kind IN ('EXPENSE','INCOME')` (SDD-005).
- **Despesas comuns do período:** `kind='EXPENSE' AND "isSharedExpense" AND "deletedAt" IS NULL AND "occurredOn" BETWEEN $start AND $end` (SDD-002).

## 6. Seed e migrações
Uma migração por história (`us-001-auth`, `us-002-familia`, …), nunca editar migração aplicada. O baseline `SystemInfo` do EN-001 permanece. Catálogo de categorias padrão em `src/modules/familia/default-categories.ts` (SDD-003 §4.3).

---

## 7. R2 — Categorias, cartões, fatura e despesas previstas (US-014..019)

*Acrescentado em 2026-10-04. Referências: [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md), [ADR-015](../adrs/ADR-015-despesa-prevista-como-entidade-propria.md), [SDD-007](../sdd/SDD-007-categorias.md), [SDD-008](../sdd/SDD-008-cartoes-fatura.md), [SDD-009](../sdd/SDD-009-despesas-previstas.md). Vale a mesma regra do §3: o **normativo** são nomes, tipos, índices, FKs compostas e o SQL de §7.3.*

### 7.1 Diagrama ER (acréscimos)

```mermaid
erDiagram
    Family ||--o{ CreditCard : ""
    Family ||--o{ CardInvoice : ""
    Family ||--o{ PlannedExpense : ""
    Member ||--o{ CreditCard : "titular (owner)"
    CreditCard ||--o{ CardInvoice : "uma por ciclo (mês de fechamento)"
    CardInvoice ||--o{ Transaction : "compras (EXPENSE) e pagamento (INVOICE_PAYMENT)"
    CreditCard ||--o{ Transaction : "cartão da compra/pagamento"
    Category ||--o{ PlannedExpense : "classifica"
    Member ||--o{ PlannedExpense : "responsável / autor"
    PlannedExpense ||--o| Transaction : "paidTransactionId (despesa gerada na baixa)"

    CreditCard { uuid id PK
      string name "único por família (case-insens.)"
      bigint limitInCents
      int closingDay "1..28"
      int dueDay "1..28"
      int version }
    CardInvoice { uuid id PK
      string referenceMonth "YYYY-MM do fechamento"
      date closingDate
      date dueDate }
    PlannedExpense { uuid id PK
      bigint amountInCents "previsto"
      date dueOn
      enum status "PREVISTO|PAGO"
      uuid paidTransactionId FK
      int version
      timestamptz deletedAt }
```

### 7.2 Schema Prisma (trechos normativos)

```prisma
enum TransactionKind      { EXPENSE INCOME OPENING TRANSFER_OUT TRANSFER_IN INVOICE_PAYMENT }   // + INVOICE_PAYMENT
enum PlannedExpenseStatus { PREVISTO PAGO }

model Category {                                  // ALTERAÇÃO (US-014): + version, updatedAt, updatedByMemberId
  // … campos existentes …
  version           Int      @default(1)
  updatedAt         DateTime @default(now()) @updatedAt @db.Timestamptz(3)
  updatedByMemberId String?  @db.Uuid               // para "alterada por {Nome}" no 409
}

model CreditCard {
  id            String   @id @default(uuid()) @db.Uuid
  familyId      String   @db.Uuid
  name          String                                     // trim; único por família ignorando caixa (§7.3)
  institution   String   @default("Outro")
  ownerMemberId String   @db.Uuid
  limitInCents  BigInt                                     // > 0
  closingDay    Int                                        // 1..28
  dueDay        Int                                        // 1..28
  version       Int      @default(1)
  updatedByMemberId String? @db.Uuid                       // para "alterado por {Nome}" no 409
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @db.Timestamptz(3)
  family       Family        @relation(fields: [familyId], references: [id])
  owner        Member        @relation(fields: [familyId, ownerMemberId], references: [familyId, id])
  invoices     CardInvoice[]
  transactions Transaction[]
  @@unique([familyId, id])
  @@map("credit_cards")
}

model CardInvoice {
  id             String   @id @default(uuid()) @db.Uuid
  familyId       String   @db.Uuid
  cardId         String   @db.Uuid
  referenceMonth String                                    // "YYYY-MM" do mês de FECHAMENTO
  closingDate    DateTime @db.Date                         // snapshot do ciclo do cartão na criação
  dueDate        DateTime @db.Date
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  card         CreditCard    @relation(fields: [familyId, cardId], references: [familyId, id])
  transactions Transaction[]
  @@unique([cardId, referenceMonth])
  @@unique([familyId, id])
  @@index([familyId, cardId, closingDate])
  @@map("card_invoices")
}

model Transaction {                               // ALTERAÇÕES
  accountId String? @db.Uuid                       // era obrigatório; NULL só em compra no cartão (CHECK §7.3)
  cardId    String? @db.Uuid
  invoiceId String? @db.Uuid
  account   BankAccount?  @relation(fields: [familyId, accountId], references: [familyId, id])
  card      CreditCard?   @relation(fields: [familyId, cardId], references: [familyId, id])
  invoice   CardInvoice?  @relation(fields: [familyId, invoiceId], references: [familyId, id])
  paidPlanned PlannedExpense? @relation("PlannedPaidTx")   // lado inverso (1:0..1)
  @@index([familyId, cardId, occurredOn])
  @@index([familyId, invoiceId])
}

model PlannedExpense {
  id                  String               @id @default(uuid()) @db.Uuid
  familyId            String               @db.Uuid
  description         String                                   // 2..100
  amountInCents       BigInt                                   // PREVISTO (> 0); o valor pago vive na Transaction
  dueOn               DateTime             @db.Date
  categoryId          String               @db.Uuid
  responsibleMemberId String               @db.Uuid
  isSharedExpense     Boolean              @default(true)
  note                String?
  status              PlannedExpenseStatus @default(PREVISTO)
  paidTransactionId   String?              @unique @db.Uuid
  authorMemberId      String               @db.Uuid
  updatedByMemberId   String?              @db.Uuid
  version             Int                  @default(1)
  createdAt           DateTime             @default(now()) @db.Timestamptz(3)
  updatedAt           DateTime             @updatedAt @db.Timestamptz(3)
  deletedAt           DateTime?            @db.Timestamptz(3)
  deletedByMemberId   String?              @db.Uuid
  family      Family       @relation(fields: [familyId], references: [id])
  category    Category     @relation(fields: [familyId, categoryId], references: [familyId, id])
  responsible Member       @relation("PlannedResponsible", fields: [familyId, responsibleMemberId], references: [familyId, id])
  author      Member       @relation("PlannedAuthor", fields: [familyId, authorMemberId], references: [familyId, id])
  paidTx      Transaction? @relation("PlannedPaidTx", fields: [familyId, paidTransactionId], references: [familyId, id])
  @@unique([familyId, id])
  @@index([familyId, status, dueOn])
  @@map("planned_expenses")
}
```
Acrescentar as relações inversas necessárias em `Family`, `Member` e `Category` (o Prisma exige). Se o Prisma 7 recusar a relação composta com `accountId` opcional, o fallback do SDD-000 vale: FK composta só no SQL e relação simples no cliente.

### 7.3 Migrações em SQL cru (uma por história; **nunca** editar migração aplicada)

Ordem e conteúdo (o Dev gera com `prisma migrate dev --create-only` e anexa o SQL):

| Migração | Conteúdo |
| :-- | :-- |
| `us014_categorias` | `categories."version"`, `"updatedAt"`, `"updatedByMemberId"` + índice único funcional de nome |
| `us015_cartoes` | `credit_cards` + `CHECK`s + índice único de nome |
| `us016_enum_invoice_payment` | **somente** `ALTER TYPE "TransactionKind" ADD VALUE 'INVOICE_PAYMENT'` (um valor novo de enum não pode ser usado na mesma transação em que nasce, por isso o arquivo é isolado) |
| `us016_compra_cartao` | `card_invoices`, colunas novas em `transactions`, FKs compostas, **substituição** de `tx_kind_shape_chk`, índices parciais |
| `us018_previstas` | enum `PlannedExpenseStatus`, `planned_expenses`, `CHECK`s |

```sql
-- us014_categorias
-- (Prisma cria a coluna "version"; o índice exato (familyId, kind, name) permanece e é redundante, mas inofensivo)
CREATE UNIQUE INDEX categories_family_kind_name_uq ON categories ("familyId", kind, lower(btrim(name)));

-- us015_cartoes (após o CREATE TABLE gerado pelo Prisma)
ALTER TABLE credit_cards ADD CONSTRAINT credit_cards_limit_chk   CHECK ("limitInCents" > 0);
ALTER TABLE credit_cards ADD CONSTRAINT credit_cards_closing_chk CHECK ("closingDay" BETWEEN 1 AND 28);
ALTER TABLE credit_cards ADD CONSTRAINT credit_cards_due_chk     CHECK ("dueDay" BETWEEN 1 AND 28);
CREATE UNIQUE INDEX credit_cards_family_name_uq ON credit_cards ("familyId", lower(btrim(name)));

-- us016_compra_cartao
-- (Prisma: transactions."accountId" DROP NOT NULL; ADD "cardId", "invoiceId"; FKs compostas ON DELETE RESTRICT)
ALTER TABLE card_invoices ADD CONSTRAINT card_invoices_ref_chk CHECK ("referenceMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE card_invoices ADD CONSTRAINT card_invoices_dates_chk CHECK ("dueDate" > "closingDate");

ALTER TABLE transactions DROP CONSTRAINT tx_kind_shape_chk;
ALTER TABLE transactions ADD CONSTRAINT tx_kind_shape_chk CHECK (
  -- despesa em conta OU compra no cartão
  (kind = 'EXPENSE' AND direction = 'DEBIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "transferGroupId" IS NULL
     AND (("accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
       OR ("accountId" IS NULL AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL)))
  OR (kind = 'INCOME'  AND direction = 'CREDIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR (kind = 'OPENING' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR (kind = 'TRANSFER_OUT' AND direction = 'DEBIT'  AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NOT NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR (kind = 'TRANSFER_IN'  AND direction = 'CREDIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NOT NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR (kind = 'INVOICE_PAYMENT' AND direction = 'DEBIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL));

-- No máximo um pagamento ATIVO por fatura
CREATE UNIQUE INDEX tx_invoice_payment_active_uq ON transactions ("invoiceId")
  WHERE kind = 'INVOICE_PAYMENT' AND "deletedAt" IS NULL;
-- Consulta de limite/total: compras ativas por fatura
CREATE INDEX tx_card_purchase_active_idx ON transactions ("familyId", "cardId", "invoiceId")
  WHERE kind = 'EXPENSE' AND "cardId" IS NOT NULL AND "deletedAt" IS NULL;

-- us018_previstas (após o CREATE TABLE gerado pelo Prisma)
ALTER TABLE planned_expenses ADD CONSTRAINT planned_amount_chk CHECK ("amountInCents" > 0);
ALTER TABLE planned_expenses ADD CONSTRAINT planned_status_paid_chk CHECK ((status = 'PAGO') = ("paidTransactionId" IS NOT NULL));
ALTER TABLE planned_expenses ADD CONSTRAINT planned_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL) OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL));
-- Previsão excluída não pode estar paga (desfazer antes)
ALTER TABLE planned_expenses ADD CONSTRAINT planned_deleted_unpaid_chk CHECK ("deletedAt" IS NULL OR status = 'PREVISTO');
```
O trigger `transactions_no_delete` e a trilha `transaction_revisions` continuam valendo para as novas linhas.

### 7.4 Consultas-chave (referência)
```sql
-- Usado do cartão (compras ativas em faturas sem pagamento ativo)
SELECT t."cardId", COALESCE(SUM(t."amountInCents"),0)::bigint AS used
FROM transactions t
WHERE t."familyId" = $1 AND t.kind = 'EXPENSE' AND t."cardId" IS NOT NULL AND t."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM transactions p WHERE p."invoiceId" = t."invoiceId" AND p.kind = 'INVOICE_PAYMENT' AND p."deletedAt" IS NULL)
GROUP BY t."cardId";

-- Total e subtotal por membro de uma fatura
SELECT t."payerMemberId", SUM(t."amountInCents")::bigint AS total, COUNT(*) AS n
FROM transactions t WHERE t."familyId" = $1 AND t."invoiceId" = $2 AND t.kind = 'EXPENSE' AND t."deletedAt" IS NULL
GROUP BY t."payerMemberId";

-- Saldo (SDD-004 §4.1) passa a filtrar contas: ... AND "accountId" IS NOT NULL
```
