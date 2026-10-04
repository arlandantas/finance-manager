import { closeTestDb, resetDb } from "../../support/db";
import { After, Before } from "./fixtures";

// Banco limpo no início de cada cenário (SDD-006 §4).
Before(async () => {
  await resetDb();
  // O "hoje" por cenário é um estado do servidor: volta ao padrão (APP_NOW_OVERRIDE) a cada cenário.
  await fetch("http://localhost:3101/api/dev/clock", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ now: null }),
  }).catch(() => undefined);
});

After(async () => {
  await closeTestDb();
});
