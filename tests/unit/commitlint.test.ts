import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const lint = (msg: string) =>
  spawnSync("pnpm", ["exec", "commitlint"], { input: msg, encoding: "utf8" });

describe("EN-001 Hooks de commit protegem o histórico", () => {
  it("rejeita mensagem fora do padrão Conventional Commits", () => {
    const r = lint("ajustes diversos\n\nCo-authored-by: Agente X <x@finance-manager.local>\n");
    expect(r.status).not.toBe(0);
  });

  it("rejeita mensagem sem o trailer Co-authored-by", () => {
    const r = lint("feat(contas): criar conta\n\nsem trailer\n");
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("Co-authored-by");
  });

  it("aceita a mensagem correta", () => {
    const r = lint(
      "feat(contas): criar conta\n\nCo-authored-by: Agente Desenvolvedor & QA <dev-qa@finance-manager.local>\n",
    );
    expect(r.status).toBe(0);
  });
});
