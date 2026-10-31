import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// US-092a (SDD-033 §8.1-3): verificação estática das leituras de membro. Lê `src/**` como texto.
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "generated") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const files = walk("src").map((p) => ({
  p: p.replaceAll("\\", "/"),
  text: readFileSync(p, "utf8"),
}));
const lines = (f: { text: string }) => f.text.split("\n");

describe("leituras de membro (SEC-058, D-033-2)", () => {
  it("(0) nenhum `userId: <x>.userId` em where sem guarda `!= null` e nenhum `userId: undefined`/`?? undefined`", () => {
    const bad: string[] = [];
    for (const f of files) {
      lines(f).forEach((l, i) => {
        if (/userId:\s*undefined/.test(l) || /userId\s*\?\?\s*undefined/.test(l))
          bad.push(`${f.p}:${i + 1} ${l.trim()}`);
        // where: { userId: owner.userId } / userId: target.userId vindo de linha de `members`
        if (/\buserId:\s*(owner|target|m|member|who|row)\.userId\b/.test(l)) {
          if (f.p.startsWith("src/lib/auth/")) return; // linhas de sessão/adapter, não de `members`
          const prev = lines(f)
            .slice(Math.max(0, i - 30), i)
            .join("\n");
          if (!/(\.userId\s*==\s*null|\.userId\s*!=\s*null|userId\s*\?\s)/.test(prev)) {
            bad.push(`${f.p}:${i + 1} ${l.trim()}`);
          }
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("(a) nenhum `user.name ??`/`localPart(` para nome de membro fora da fonte única e das exceções", () => {
    const allowed = [
      "src/modules/familia/display-name.ts",
      "src/lib/auth/",
      "src/app/perfil/",
      "src/app/onboarding/",
      "src/app/(app)/layout.tsx",
      "src/modules/familia/invitations/", // convites: nome do convidante vem de memberDisplayName; e-mail local aqui é do convidado
      "src/modules/analise-ia/service.ts", // lista proibida no payload: TODOS os nomes/e-mails de usuários (não é nome de exibição)
      "src/modules/mcp/context.ts", // nome do USUÁRIO da sessão (não de membro)
      "src/modules/privacidade/delete-account.ts", // `user.name` do titular da conta excluída
      "src/modules/privacidade/export.ts", // perfil do titular (`user.name`), não nome de membro
    ];
    const bad: string[] = [];
    for (const f of files) {
      if (allowed.some((a) => f.p.startsWith(a) || f.p === a)) continue;
      lines(f).forEach((l, i) => {
        if (
          /\buser\.name\s*\?\?/.test(l) ||
          /\blocalPart\(/.test(l) ||
          /user\??\.email\.split\("@"\)/.test(l)
        ) {
          bad.push(`${f.p}:${i + 1} ${l.trim()}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  it("(b) `pendingEmail` só aparece em familia/**, privacidade/delete-* e no schema/tipos gerados", () => {
    const bad = files
      .filter((f) => /pendingEmail/.test(f.text))
      .map((f) => f.p)
      .filter(
        (p) =>
          !p.startsWith("src/modules/familia/") && !p.startsWith("src/modules/privacidade/delete-"),
      );
    expect(bad).toEqual([]);
  });

  it("(c) nenhum member.update* com `userId` em data fora do aceite de convite (094b)", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (f.p === "src/modules/familia/invitations/service.ts") continue;
      const re =
        /member\.(update|updateMany|upsert)\(\s*\{[\s\S]{0,400}?data:\s*\{[^}]*\buserId\s*:/g;
      if (re.test(f.text)) bad.push(f.p);
      if (
        /UPDATE members[^`]*"userId"\s*=\s*\$\{/i.test(f.text) &&
        !f.p.endsWith("delete-account.ts")
      ) {
        bad.push(`${f.p} (SQL)`);
      }
    }
    expect(bad).toEqual([]);
  });
});
