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
  // EN-004: o provedor simulado volta ao cenário "ok", sem atraso e sem chamadas registradas
  await fetch("http://localhost:3101/api/dev/llm-scenario", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reset: true }),
  }).catch(() => undefined);
});

// US-027: o app começa com valores ocultos (padrão). Os cenários antigos conferem valores na tela,
// então o navegador de teste simula "o usuário já escolheu mostrar" (preferência ausente => visível),
// exceto nos cenários marcados com @valores-ocultos, que exercitam o padrão real.
Before(async ({ context, $tags }) => {
  if ($tags.includes("@valores-ocultos")) return;
  await context.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, key: string) {
      const v = real.call(this, key);
      return v === null && /^fm:v1:u:.+:hideValues$/.test(key) ? "false" : v;
    };
  });
});

// US-061/US-063: o card "Resumo do mês" da Início vem fechado por padrão (preferência por dispositivo).
// Os cenários que conferem Receitas/Despesas, saldos, participação e acerto precisam dele aberto, então
// o navegador de teste simula "o usuário já abriu o card" (preferência ausente => aberto), exceto nos
// cenários marcados com @resumo-fechado, que exercitam o padrão real.
Before(async ({ context, $tags }) => {
  if ($tags.includes("@resumo-fechado")) return;
  await context.addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, key: string) {
      const v = real.call(this, key);
      return v === null && /^fm:v1:u:.+:homeSummaryOpen$/.test(key) ? "true" : v;
    };
  });
});

After(async () => {
  await closeTestDb();
});
