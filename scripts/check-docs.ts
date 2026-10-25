/**
 * Verificações da documentação (agents/INDEX.md). Uso: `pnpm check:docs`.
 *  1. Sem link markdown relativo quebrado em agents/**\/*.md, README.md, AGENTS.md, CLAUDE.md.
 *  2. Cada agents/estado/*.md tem o cabeçalho "Atualizado:" e no máximo MAX_WORDS palavras.
 *  3. agents/INDEX.md só cita arquivos de estado que existem.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const MAX_WORDS = 2800;
const ROOT_URL = "file:///home/arlan/ai-tests/finance-manager/";

export type DocViolation = { file: string; rule: string; message: string };

function listMd(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listMd(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function stripCode(text: string): string {
  return text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
}

export function brokenLinks(file: string, text: string, root: string): DocViolation[] {
  const out: DocViolation[] = [];
  const re = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  for (const m of stripCode(text).matchAll(re)) {
    let target = m[1] ?? "";
    if (target.startsWith(ROOT_URL))
      target = path.relative(path.dirname(file), path.join(root, target.slice(ROOT_URL.length)));
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/"))
      continue;
    const clean = decodeURIComponent(target.split("#")[0]?.split("?")[0] ?? "");
    if (!clean) continue;
    if (!existsSync(path.resolve(path.dirname(file), clean)))
      out.push({
        file: path.relative(root, file),
        rule: "link-quebrado",
        message: `link relativo inexistente: ${m[1]}`,
      });
  }
  return out;
}

export function estadoViolations(file: string, text: string): DocViolation[] {
  const out: DocViolation[] = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > MAX_WORDS)
    out.push({ file, rule: "estado-tamanho", message: `${words} palavras (máx. ${MAX_WORDS})` });
  if (!/^Atualizado:/m.test(text))
    out.push({ file, rule: "estado-cabecalho", message: 'falta o cabeçalho "Atualizado:"' });
  return out;
}

export function indexViolations(text: string, root: string): DocViolation[] {
  const out: DocViolation[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/estado\/([A-Za-z0-9_-]+\.md)/g)) {
    const name = m[1] ?? "";
    if (seen.has(name)) continue;
    seen.add(name);
    if (!existsSync(path.join(root, "agents/estado", name)))
      out.push({
        file: "agents/INDEX.md",
        rule: "index-estado",
        message: `cita estado inexistente: estado/${name}`,
      });
  }
  return out;
}

export function checkDocs(root: string): DocViolation[] {
  const out: DocViolation[] = [];
  const files = [
    ...listMd(path.join(root, "agents")),
    ...["README.md", "AGENTS.md", "CLAUDE.md"].map((f) => path.join(root, f)),
  ].filter(existsSync);
  for (const f of files) out.push(...brokenLinks(f, readFileSync(f, "utf8"), root));
  const estadoDir = path.join(root, "agents/estado");
  if (existsSync(estadoDir))
    for (const name of readdirSync(estadoDir).filter((n) => n.endsWith(".md")))
      out.push(
        ...estadoViolations(
          `agents/estado/${name}`,
          readFileSync(path.join(estadoDir, name), "utf8"),
        ),
      );
  const index = path.join(root, "agents/INDEX.md");
  if (existsSync(index)) out.push(...indexViolations(readFileSync(index, "utf8"), root));
  else out.push({ file: "agents/INDEX.md", rule: "index-estado", message: "arquivo ausente" });
  return out;
}

if (process.argv[1]?.endsWith("check-docs.ts")) {
  const violations = checkDocs(process.cwd());
  for (const v of violations) console.error(`${v.file}: [${v.rule}] ${v.message}`);
  if (violations.length > 0) {
    console.error(`check:docs falhou: ${violations.length} problema(s)`);
    process.exit(1);
  }
  console.log("check:docs ok");
}
