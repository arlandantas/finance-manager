/**
 * Verificações da documentação (AGENTS.md). Uso: `pnpm check:docs`.
 *  1. Sem link markdown relativo quebrado em docs/**\/*.md, README.md, AGENTS.md, CLAUDE.md.
 *  2. Limites de linhas: AGENTS ≤80, spec ≤120, história ≤60, ADR ≤40, STATE ≤40.
 *  3. Toda docs/backlog/stories/<ID>.md tem uma linha em docs/backlog/index.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const LIMITS: { dir: string; max: number }[] = [
  { dir: "docs/spec", max: 120 },
  { dir: "docs/backlog/stories", max: 60 },
  { dir: "docs/adr", max: 40 },
];
const FILE_LIMITS: Record<string, number> = { "AGENTS.md": 80, "docs/STATE.md": 40 };
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

export function sizeViolations(file: string, text: string, max: number): DocViolation[] {
  const lines = text.replace(/\n$/, "").split("\n").length;
  return lines > max ? [{ file, rule: "tamanho", message: `${lines} linhas (máx. ${max})` }] : [];
}

export function indexViolations(indexText: string, storyIds: string[]): DocViolation[] {
  return storyIds
    .filter((id) => !new RegExp(`\\|\\s*${id}\\s*\\|`).test(indexText))
    .map((id) => ({
      file: "docs/backlog/index.md",
      rule: "index-historia",
      message: `sem linha para a história ${id}`,
    }));
}

export function checkDocs(root: string): DocViolation[] {
  const out: DocViolation[] = [];
  const docsDir = path.join(root, "docs");
  const files = [
    ...(existsSync(docsDir) ? listMd(docsDir) : []),
    ...["README.md", "AGENTS.md", "CLAUDE.md"].map((f) => path.join(root, f)),
  ].filter(existsSync);
  for (const f of files) out.push(...brokenLinks(f, readFileSync(f, "utf8"), root));

  for (const [rel, max] of Object.entries(FILE_LIMITS)) {
    const f = path.join(root, rel);
    if (existsSync(f)) out.push(...sizeViolations(rel, readFileSync(f, "utf8"), max));
  }
  for (const { dir, max } of LIMITS) {
    const d = path.join(root, dir);
    if (!existsSync(d)) continue;
    for (const name of readdirSync(d).filter((n) => n.endsWith(".md")))
      out.push(...sizeViolations(`${dir}/${name}`, readFileSync(path.join(d, name), "utf8"), max));
  }

  const storiesDir = path.join(root, "docs/backlog/stories");
  const index = path.join(root, "docs/backlog/index.md");
  if (existsSync(storiesDir)) {
    const ids = readdirSync(storiesDir)
      .filter((n) => n.endsWith(".md"))
      .map((n) => n.replace(/\.md$/, ""));
    if (existsSync(index)) out.push(...indexViolations(readFileSync(index, "utf8"), ids));
    else out.push({ file: "docs/backlog/index.md", rule: "index-historia", message: "ausente" });
  }
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
