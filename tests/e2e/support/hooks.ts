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

// US-027: o app começa com valores ocultos (padrão). Os cenários antigos conferem valores na tela,
// então o navegador de teste simula "o usuário já escolheu mostrar" (preferência ausente => visível),
// exceto nos cenários marcados com @valores-ocultos, que exercitam o padrão real.
Before(async ({ page, $tags }) => {
  if ($tags.includes("@valores-ocultos")) return;
  await page.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, key: string) {
      const v = real.call(this, key);
      return v === null && /^fm:v1:u:.+:hideValues$/.test(key) ? "false" : v;
    };
  });
});

After(async () => {
  await closeTestDb();
});
