// ADR-024: modo de homologação rápida. Build de produção (standalone) + login de teste, só local.
// Uso: node scripts/homolog.mjs build
//      node scripts/homolog.mjs start [--port 3100] [--lan 192.168.x.y]
// Plain JS (sem tsx) para não pesar na máquina de teste. Só liga o login de teste com a flag explícita
// APP_HOMOLOG_MODE (ADR-024 rev. 2); AUTH_GOOGLE_* do .env.local passam (Google real coexiste).
import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

const root = path.resolve(import.meta.dirname, "..");
const DIST = ".next-homolog";
const distPath = path.join(root, DIST);
const standalone = path.join(distPath, "standalone");

/** .env.local e .env (como o Next): não sobrescreve o que já está no ambiente. */
function fileEnv() {
  const merged = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (existsSync(file)) Object.assign(merged, parse(readFileSync(file)));
  }
  return { ...merged, ...process.env };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function homologEnv() {
  const port = arg("--port", process.env.HOMOLOG_PORT ?? "3100");
  const lanIp = arg("--lan", undefined);
  const bind = lanIp ?? "127.0.0.1";
  // A origem pública usa "localhost" porque o redirect do Google (EXT-01) é cadastrado com ele; no Windows
  // isso custa ~200 ms por conexão (tenta ::1 antes), aceitável na homologação.
  const origin = `http://${lanIp ?? "localhost"}:${port}`;
  return {
    ...fileEnv(),
    NODE_ENV: "production",
    NEXT_DIST_DIR: DIST,
    APP_HOMOLOG_MODE: "true",
    AUTH_DEV_LOGIN: "true",
    AUTH_TRUST_HOST: "true",
    HOSTNAME: bind,
    PORT: port,
    APP_URL: origin,
    AUTH_URL: origin,
  };
}

function run(cmd, args, env) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, env, stdio: "inherit" });
    const stop = () => child.kill("SIGTERM");
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function build() {
  rmSync(standalone, { recursive: true, force: true });
  const code = await run(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "build"],
    homologEnv(),
  );
  if (code !== 0) process.exit(code);
  // O standalone não traz public/ nem os estáticos do cliente: copia como manda a doc do Next.
  cpSync(path.join(distPath, "static"), path.join(standalone, DIST, "static"), { recursive: true });
  if (existsSync(path.join(root, "public"))) {
    cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
  }
  console.log(`\nBuild de homologação pronto em ${DIST}/standalone. Suba com: pnpm homolog:start`);
}

async function start() {
  const server = path.join(standalone, "server.js");
  if (!existsSync(server)) {
    console.error("Build de homologação não encontrado. Rode antes: pnpm homolog:build");
    process.exit(1);
  }
  const env = homologEnv();
  console.log(`Homologação (ADR-024): ${env.APP_URL}  [build de produção + login de teste]`);
  process.exit(await run(process.execPath, [server], env));
}

const cmd = process.argv[2];
if (cmd === "build") await build();
else if (cmd === "start") await start();
else {
  console.error("Uso: node scripts/homolog.mjs build | start [--port 3100] [--lan <ip-privado>]");
  process.exit(2);
}
