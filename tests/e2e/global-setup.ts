import { migrateTestDb } from "../support/db";

// Garante o schema atual no db-test antes de subir o app de E2E (porta 3101).
export default function globalSetup() {
  migrateTestDb();
}
