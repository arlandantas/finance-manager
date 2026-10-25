import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacidadePage from "@/app/privacidade/page";
import { SESSION_ABSOLUTE_SECONDS, SESSION_IDLE_SECONDS } from "@/lib/auth/session";
import {
  ENDED_SESSION_RETENTION_DAYS,
  IDEMPOTENCY_RETENTION_HOURS,
  INVITATION_RETENTION_DAYS,
} from "@/modules/cron/retention";
import { AI_RETENTION_MONTHS } from "@/modules/ia/purge";
import {
  CONTACT_PLACEHOLDER,
  POLICY_UPDATED_ON,
  POLICY_VERSION,
  RETENTION_ROWS,
} from "@/modules/privacidade/policy";

// SEC-017e (US-082): a página pública "Privacidade". Texto = rascunho do PO; contato por env.
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://x:y@localhost:5443/z");
  vi.stubEnv("AUTH_SECRET", "segredo");
  vi.stubEnv("PRIVACY_CONTACT_EMAIL", "");
});
afterEach(() => vi.unstubAllEnvs());

const html = () => renderToStaticMarkup(PrivacidadePage());

describe("página Privacidade", () => {
  it("traz os blocos mínimos: dados, finalidade, compartilhamento, retenção, direitos e contato", () => {
    const h = html();
    for (const t of [
      "O que guardamos",
      "Para quê",
      "Com quem compartilhamos",
      "Por quanto tempo",
      "Seus direitos",
      "Contato",
      "provedor de IA contratado pelo app",
      "assistente de IA",
      "Baixar meus dados",
      "Excluir minha conta",
      "excluir a família inteira",
    ]) {
      expect(h).toContain(t);
    }
  });

  it("mostra versão e data da última atualização", () => {
    const h = html();
    expect(h).toContain(`Versão ${POLICY_VERSION}`);
    expect(h).toContain(POLICY_UPDATED_ON.split("-").reverse().join("/"));
  });

  it("avisa que é rascunho aguardando aprovação", () => {
    expect(html()).toContain("Rascunho");
  });

  it("sem PRIVACY_CONTACT_EMAIL mostra o marcador; com ela, um link mailto", () => {
    expect(html()).toContain(CONTACT_PLACEHOLDER);
    vi.stubEnv("PRIVACY_CONTACT_EMAIL", "privacidade@exemplo.com");
    const h = html();
    expect(h).toContain('href="mailto:privacidade@exemplo.com"');
    expect(h).not.toContain(CONTACT_PLACEHOLDER);
  });

  it("os prazos do texto vêm das constantes do expurgo (texto e comportamento não se separam)", () => {
    const text = RETENTION_ROWS.map((r) => r.prazo).join("\n");
    expect(text).toContain(`${SESSION_IDLE_SECONDS / 86_400} dias sem uso`);
    expect(text).toContain(`${SESSION_ABSOLUTE_SECONDS / 86_400} dias depois do login`);
    expect(text).toContain(`${ENDED_SESSION_RETENTION_DAYS} dias`);
    expect(text).toContain(`${INVITATION_RETENTION_DAYS} dias depois do encerramento`);
    expect(text).toContain(`${IDEMPOTENCY_RETENTION_HOURS} horas`);
    expect(text).toContain(`${AI_RETENTION_MONTHS / 12} anos`);
  });

  it("é responsiva: tabela com rolagem própria e sem largura fixa no contêiner", () => {
    const h = html();
    expect(h).toContain("overflow-x-auto");
    expect(h).not.toMatch(/style="[^"]*width:\s*\d{4}px/);
  });
});
