import { closeTestDb, resetDb } from "../../support/db";
import { After, Before } from "./fixtures";

// Banco limpo no início de cada cenário (SDD-006 §4).
Before(async () => {
  await resetDb();
});

After(async () => {
  await closeTestDb();
});
