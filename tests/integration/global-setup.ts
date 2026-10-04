import { migrateTestDb } from "../support/db";

// Aplica as migrações (inclusive o SQL cru) no banco de teste antes da suíte de integração.
export default function setup() {
  migrateTestDb();
}
