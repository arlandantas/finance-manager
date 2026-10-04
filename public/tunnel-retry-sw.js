// Service Worker de DEV, ativo só quando APP_PUBLIC_ORIGIN está definido (túnel de teste, ex.: localtunnel).
// O localtunnel gratuito aceita só 2 conexões simultâneas e responde 502/429 às demais; o app em dev faz
// dezenas de requisições em paralelo. Este SW limita a concorrência (MAX_PARALLEL) e repete 502/429/503.
// Nunca é registrado em produção (ver src/components/tunnel-retry.tsx).
const MAX_PARALLEL = 2;
const MAX_ATTEMPTS = 8;
const RETRY_STATUS = new Set([429, 502, 503, 504]);

let running = 0;
const waiting = [];

function acquire() {
  if (running < MAX_PARALLEL) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(request) {
  await acquire();
  try {
    for (let attempt = 1; ; attempt++) {
      let res;
      try {
        res = await fetch(request.clone());
      } catch (e) {
        if (attempt >= MAX_ATTEMPTS) throw e;
        await sleep(150 * attempt);
        continue;
      }
      if (!RETRY_STATUS.has(res.status) || attempt >= MAX_ATTEMPTS) return res;
      await sleep(100 * attempt + Math.random() * 100);
    }
  } finally {
    release();
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/webpack-hmr") || url.pathname === "/_next/hmr") return;
  if (request.headers.get("accept")?.includes("text/event-stream")) return;
  event.respondWith(fetchWithRetry(request));
});
